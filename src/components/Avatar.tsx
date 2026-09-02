import Image from "next/image";
import { Logo } from "./Logo";

// Shared avatar-with-fallback: a real avatarUrl renders as an image, no
// avatarUrl falls back to the brand mark. Previously duplicated per call
// site (profile header, UserListItem, ...) with slightly different markup
// each time — the exact gap COMPONENT_LIBRARY.md flags ("extract into a
// shared Avatar component before it's needed a third time").
export function Avatar({
  src,
  alt,
  size = 40,
  className,
}: {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        unoptimized={!src.includes(".public.blob.vercel-storage.com/")}
      />
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
    >
      <Logo size={size} />
    </span>
  );
}
