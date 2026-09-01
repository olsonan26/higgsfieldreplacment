#!/usr/bin/env python3
"""Resume and verify a RunPod S3 multipart upload without re-sending good parts.

Credentials are read from a local JSON file and are never printed. The JSON file
must contain accessKeyId, secretAccessKey, endpoint, and bucket fields.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--upload-id")
    parser.add_argument("--region", default="EU-RO-1")
    parser.add_argument("--part-size", type=int, default=50 * 1024 * 1024)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--retries", type=int, default=20)
    return parser.parse_args()


def retry(label: str, attempts: int, operation):
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except (BotoCoreError, ClientError) as exc:
            if attempt == attempts:
                raise
            delay = min(30, 2 ** min(attempt, 5))
            print(f"{label}: retry {attempt}/{attempts} in {delay}s ({type(exc).__name__})")
            time.sleep(delay)


def list_parts(client, bucket: str, key: str, upload_id: str, retries: int) -> list[dict]:
    def fetch() -> list[dict]:
        parts: list[dict] = []
        paginator = client.get_paginator("list_parts")
        for page in paginator.paginate(Bucket=bucket, Key=key, UploadId=upload_id):
            parts.extend(page.get("Parts", []))
        return parts

    return retry("list_parts", retries, fetch)


def main() -> None:
    args = parse_args()
    credentials = json.loads(Path(args.credentials).read_text(encoding="utf-8"))
    file_path = Path(args.file).resolve(strict=True)
    file_size = file_path.stat().st_size
    total_parts = math.ceil(file_size / args.part_size)
    bucket = credentials["bucket"]

    session = boto3.session.Session(
        aws_access_key_id=credentials["accessKeyId"],
        aws_secret_access_key=credentials["secretAccessKey"],
        region_name=args.region,
    )
    client = session.client(
        "s3",
        endpoint_url=credentials["endpoint"],
        config=Config(
            region_name=args.region,
            connect_timeout=60,
            read_timeout=300,
            retries={"max_attempts": 10, "mode": "standard"},
        ),
    )

    upload_id = args.upload_id
    if not upload_id:
        created = retry(
            "create_multipart_upload",
            args.retries,
            lambda: client.create_multipart_upload(Bucket=bucket, Key=args.key),
        )
        upload_id = created["UploadId"]
        print(f"Created multipart upload: {upload_id}")

    existing = list_parts(client, bucket, args.key, upload_id, args.retries)
    existing_by_number = {part["PartNumber"]: part for part in existing}
    missing: list[int] = []
    for number in range(1, total_parts + 1):
        expected_size = min(args.part_size, file_size - (number - 1) * args.part_size)
        part = existing_by_number.get(number)
        if part is None or part.get("Size") != expected_size:
            missing.append(number)

    print(
        f"Found {len(existing_by_number)}/{total_parts} valid parts; "
        f"uploading {len(missing)} missing parts."
    )

    def upload_part(number: int) -> int:
        offset = (number - 1) * args.part_size
        length = min(args.part_size, file_size - offset)

        def send():
            with file_path.open("rb") as source:
                source.seek(offset)
                body = source.read(length)
            return client.upload_part(
                Bucket=bucket,
                Key=args.key,
                UploadId=upload_id,
                PartNumber=number,
                Body=body,
            )

        retry(f"part {number}", args.retries, send)
        return number

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(upload_part, number) for number in missing]
        completed = 0
        for future in as_completed(futures):
            number = future.result()
            completed += 1
            print(f"Uploaded missing part {number} ({completed}/{len(missing)}).")

    verified = list_parts(client, bucket, args.key, upload_id, args.retries)
    verified_by_number = {part["PartNumber"]: part for part in verified}
    if len(verified_by_number) != total_parts:
        raise RuntimeError(
            f"Multipart verification failed: found {len(verified_by_number)}/{total_parts} parts"
        )

    completion_parts = [
        {"PartNumber": number, "ETag": verified_by_number[number]["ETag"]}
        for number in range(1, total_parts + 1)
    ]

    print("All parts verified; completing multipart upload.")
    try:
        retry(
            "complete_multipart_upload",
            args.retries,
            lambda: client.complete_multipart_upload(
                Bucket=bucket,
                Key=args.key,
                UploadId=upload_id,
                MultipartUpload={"Parts": completion_parts},
            ),
        )
    except (BotoCoreError, ClientError):
        head_after_error = retry(
            "head_object after completion error",
            args.retries,
            lambda: client.head_object(Bucket=bucket, Key=args.key),
        )
        if head_after_error.get("ContentLength") != file_size:
            raise
    head = retry(
        "head_object",
        args.retries,
        lambda: client.head_object(Bucket=bucket, Key=args.key),
    )
    if head.get("ContentLength") != file_size:
        raise RuntimeError(
            f"Remote object has {head.get('ContentLength')} bytes; expected {file_size}"
        )
    print(f"Verified completed object: {args.key} ({file_size} bytes).")


if __name__ == "__main__":
    main()
