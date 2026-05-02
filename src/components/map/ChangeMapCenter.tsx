
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { LatLngExpression } from "leaflet";

interface ChangeMapCenterProps {
  center: LatLngExpression;
}

const ChangeMapCenter = ({ center }: ChangeMapCenterProps) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  
  return null;
};

export default ChangeMapCenter;
