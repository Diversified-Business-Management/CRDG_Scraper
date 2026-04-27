'use client';

import { useMemo } from 'react';

export function Map({
  lat,
  lng,
  zoom = 12,
}: {
  lat: number;
  lng: number;
  zoom?: number;
}) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const osmUrl = useMemo(() => {
    const dx = 0.02;
    const bbox = [lng - dx, lat - dx, lng + dx, lat + dx].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  }, [lat, lng]);

  if (mapboxToken) {
    // Mapbox static embed (lightweight; avoids GL bundle)
    const src = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+f59e0b(${lng},${lat})/${lng},${lat},${zoom},0/640x360@2x?access_token=${mapboxToken}`;
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Map" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border bg-muted">
      <iframe
        src={osmUrl}
        title="OpenStreetMap location"
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
