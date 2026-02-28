import { useCallback, useSyncExternalStore } from "react";
import { audioManager } from "../audio/audioManager";

export function useAudio() {
  const sfxMuted = useSyncExternalStore(
    audioManager.subscribe,
    audioManager.getSfxMuted,
  );

  const toggleSfxMute = useCallback(() => {
    audioManager.toggleSfxMute();
  }, []);

  return { sfxMuted, toggleSfxMute };
}
