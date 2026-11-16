import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useShellBreakpoints() {
  const wide = useMediaQuery("(min-width: 1366px)");
  const huge = useMediaQuery("(min-width: 1600px)");
  const narrow = useMediaQuery("(max-width: 1199px)");
  const tooSmall = useMediaQuery("(max-width: 1023px)");
  return { wide, huge, narrow, tooSmall };
}
