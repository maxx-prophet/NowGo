import { useState, useEffect } from "react";
import * as Location from "expo-location";

type PermissionStatus = "granted" | "denied" | "undetermined";

function normalizePermissionStatus(status: string): PermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export function useLocation(): {
  coords: Location.LocationObjectCoords | null;
  permissionStatus: PermissionStatus;
} {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("undetermined");

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const normalized = normalizePermissionStatus(status);
      setPermissionStatus(normalized);
      if (normalized === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords(loc.coords);
      }
    })();
  }, []);

  return { coords, permissionStatus };
}
