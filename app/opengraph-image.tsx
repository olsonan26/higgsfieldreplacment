import { ImageResponse } from "next/og";

export const alt = "VesperFrame — Direct the impossible.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#F4F1EA",
          background:
            "radial-gradient(circle at 75% 20%, #283154 0, #101626 38%, #070A12 72%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              border: "7px solid #7C5CFF",
              borderTopColor: "#54D6FF",
              borderRightColor: "#FF6B57",
              borderRadius: "50%",
            }}
          />
          VesperFrame
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 94, letterSpacing: -4 }}>
            Direct the impossible.
          </strong>
          <span style={{ marginTop: 24, fontSize: 31, color: "#AAB4D0" }}>
            Private, precise image and video production.
          </span>
        </div>
        <div style={{ display: "flex", width: 260, height: 8 }}>
          <span style={{ flex: 1, background: "#7C5CFF" }} />
          <span style={{ flex: 1, background: "#54D6FF" }} />
          <span style={{ flex: 1, background: "#FF6B57" }} />
        </div>
      </div>
    ),
    size,
  );
}
