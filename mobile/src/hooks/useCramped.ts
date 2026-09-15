import { useWindowDimensions } from "react-native";
import { isCramped } from "../services/cramped";

// True when the screen should stack its side-by-side rows. See
// services/cramped.ts for what counts. useWindowDimensions re-renders on
// both text-size and Display Zoom changes, so this tracks either live.
export function useCramped(): boolean {
  const { fontScale, width } = useWindowDimensions();
  return isCramped({ fontScale, width });
}
