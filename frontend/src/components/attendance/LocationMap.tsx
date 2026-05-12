import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
  officeLat: number;
  officeLng: number;
  officeRadius: number;
  height?: string;
}

export default function LocationMap({ lat, lng, officeLat, officeLng, officeRadius, height = '200px' }: Props) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      const map = L.default.map(containerRef.current!, { zoomControl: true, scrollWheelZoom: false });
      mapRef.current = map;

      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Office marker
      const officeIcon = L.default.divIcon({
        html: '<div style="background:#000;border-radius:50%;width:14px;height:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
        iconAnchor: [7, 7],
        className: '',
      });

      // User marker
      const userIcon = L.default.divIcon({
        html: '<div style="background:#2563eb;border-radius:50%;width:14px;height:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
        iconAnchor: [7, 7],
        className: '',
      });

      L.default.marker([officeLat, officeLng], { icon: officeIcon }).addTo(map).bindPopup('Office');
      L.default.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup('Your Location');

      // Office radius circle
      L.default.circle([officeLat, officeLng], {
        radius: officeRadius,
        color: '#000',
        fillColor: '#000',
        fillOpacity: 0.08,
        weight: 1.5,
      }).addTo(map);

      map.fitBounds([[lat, lng], [officeLat, officeLng]], { padding: [20, 20] });
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, officeLat, officeLng, officeRadius]);

  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-gray-200 z-0" />;
}
