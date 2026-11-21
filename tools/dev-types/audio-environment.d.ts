// Handwritten development contract, not an official or redistributed game SDK.
// Adapter signatures: src/js/PBZForewarn/adapter.js createAdapter valid/path.
// Lookup shape: audio-environment.js and its existing audio-environment.test.js.
// Only the probe's used boundary is described. Reflected scalar values stay
// unknown until the runtime's field/typeof guards inspect them. No build-wide
// callability, device availability or audible playback guarantee is implied.
export interface ProbeObject {
    readonly ClassDefaultObject?: ProbeObject;
    readonly AudioRouting?: unknown;
    readonly bWwiseSoundEngineEnabled?: unknown;
    readonly bWwiseAudioLinkEnabled?: unknown;
    readonly bAkAudioMixerEnabled?: unknown;
}

export interface ProbeUE {
    readonly Object: {
        readonly Find?: (path: string) => ProbeObject | null;
    };
}

export interface ProbeAdapter {
    valid(value: unknown): boolean;
    path(value: unknown): string;
}
