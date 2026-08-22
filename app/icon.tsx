import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#101626",
          borderRadius: 15,
        }}
      >
        <div
          style={{
            width: 35,
            height: 35,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "7px solid #7C5CFF",
            borderTopColor: "#54D6FF",
            borderRightColor: "#FF6B57",
            borderRadius: "50%",
          }}
        />
      </div>
    ),
    size,
  );
}
