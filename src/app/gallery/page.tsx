import Image from "next/image";
import images from "../../data/extracted-images.json";

export const metadata = { title: "Extracted images" };

export default function GalleryPage() {
  const urls: string[] = images as string[];
  return (
    <main style={{ padding: 20 }}>
      <h1>Extracted Images (max width 500)</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {urls.map((u) => (
          <div
            key={u}
            style={{
              maxWidth: 500,
              width: "100%",
              border: "1px solid #eee",
              padding: 6,
            }}
          >
            <Image
              src={u}
              width={500}
              height={500}
              alt="extracted"
              style={{ width: "100%", height: "auto", objectFit: "contain" }}
            />
            <div style={{ fontSize: 12, wordBreak: "break-all", marginTop: 6 }}>
              {u}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
