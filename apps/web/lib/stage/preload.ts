import {
  listStageAssets,
  type PreloadTier,
  type StageAssetEntry,
} from "./assets";

export interface PreloadStageReport {
  readonly total: number;
  readonly procedural: number;
  readonly preloaded: number;
  readonly failed: number;
}

export interface PreloadStageOptions {
  tier?: PreloadTier | "all";
  preloadGlb?: (src: string) => Promise<void> | void;
  preloadImage?: (src: string) => Promise<void>;
  preloadVideo?: (src: string, posterSrc?: string) => Promise<void>;
}

function defaultPreloadImage(src: string): Promise<void> {
  if (typeof Image === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
    img.src = src;
  });
}

function defaultPreloadVideo(src: string, posterSrc?: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
  const tasks: Promise<void>[] = [];
  if (posterSrc) {
    tasks.push(defaultPreloadImage(posterSrc));
  }
  tasks.push(
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      const done = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("error", done);
        resolve();
      };
      video.addEventListener("loadedmetadata", done);
      video.addEventListener("error", done);
      video.src = src;
    }),
  );
  return Promise.all(tasks).then(() => undefined);
}

async function defaultPreloadGlb(src: string): Promise<void> {
  if (typeof window === "undefined") return;
  const mod = await import("@react-three/drei");
  mod.useGLTF.preload(src, false, true);
}

let inFlightInitial: Promise<PreloadStageReport> | null = null;

/**
 * Background preload hook called while waiting in queue or initializing the stage.
 * Respects procedural placeholders (zero network requests) and offline meshopt GLB loading.
 */
export async function preloadStage(
  options: PreloadStageOptions = {},
): Promise<PreloadStageReport> {
  const tier = options.tier ?? "initial";
  const hasCustomLoaders = Boolean(
    options.preloadGlb || options.preloadImage || options.preloadVideo,
  );

  if (!hasCustomLoaders && tier === "initial" && inFlightInitial) {
    return inFlightInitial;
  }

  const run = async (): Promise<PreloadStageReport> => {
    const entries: StageAssetEntry[] = listStageAssets().filter((entry) =>
      tier === "all" ? true : entry.preloadTier === tier,
    );

    const loadImage = options.preloadImage ?? defaultPreloadImage;
    const loadVideo = options.preloadVideo ?? defaultPreloadVideo;
    const loadGlb = options.preloadGlb ?? defaultPreloadGlb;

    let procedural = 0;
    let preloaded = 0;
    let failed = 0;

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.type === "procedural") {
          procedural += 1;
          return;
        }
        try {
          if (entry.type === "image") {
            await loadImage(entry.src);
          } else if (entry.type === "video") {
            await loadVideo(entry.src, entry.posterSrc);
          } else if (entry.type === "glb") {
            await loadGlb(entry.src);
          }
          preloaded += 1;
        } catch {
          failed += 1;
        }
      }),
    );

    return {
      total: entries.length,
      procedural,
      preloaded,
      failed,
    };
  };

  const promise = run();
  if (!hasCustomLoaders && tier === "initial") {
    inFlightInitial = promise;
  }
  return promise;
}
