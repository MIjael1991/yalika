'use client';

import { useMemo, useState } from 'react';

type GalleryImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
};

export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const orderedImages = useMemo(
    () =>
      [...images].sort(
        (left, right) =>
          Number(right.isPrimary) -
            Number(left.isPrimary) ||
          left.sortOrder - right.sortOrder,
      ),
    [images],
  );
  const [selectedId, setSelectedId] = useState(
    orderedImages[0]?.id ?? '',
  );
  const selectedImage =
    orderedImages.find(
      (image) => image.id === selectedId,
    ) ?? orderedImages[0];

  if (!selectedImage) {
    return null;
  }

  return (
    <>
      <img
        src={selectedImage.url}
        alt={productName}
        className="h-full w-full bg-white object-contain transition duration-500 group-hover:scale-105"
      />
      {orderedImages.length > 1 ? (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
            {orderedImages.length} fotos
          </span>
          <div className="absolute inset-x-3 bottom-3 flex gap-1.5 overflow-x-auto rounded-2xl bg-black/45 p-1.5 backdrop-blur">
            {orderedImages.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() =>
                  setSelectedId(image.id)
                }
                className={`h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  selectedImage.id === image.id
                    ? 'border-white'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`Ver otra fotografía de ${productName}`}
              >
                <img
                  src={image.url}
                  alt=""
                  className="h-full w-full bg-white object-contain"
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
