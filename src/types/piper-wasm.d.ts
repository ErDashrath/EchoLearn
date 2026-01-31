/**
 * Type declarations for piper-wasm
 * 
 * @module types/piper-wasm
 */

declare module 'piper-wasm' {
  export interface PiperGenerateResult {
    file: string; // Blob URL for the generated audio
    phonemes?: string[];
  }

  export type ProgressCallback = (progress: number) => void;

  export function piperGenerate(
    phonemizeJs: string,
    phonemizeWasm: string,
    phonemizeData: string,
    workerJs: string,
    modelUrl: string,
    configUrl: string,
    speakerId: number | null,
    text: string,
    progressCallback?: ProgressCallback | null,
    phonemeIds?: number[] | null,
    inferEmotion?: boolean
  ): Promise<PiperGenerateResult>;

  export const HF_BASE: string;
}
