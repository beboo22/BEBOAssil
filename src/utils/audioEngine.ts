// Web Audio API based music/sfx generator - no external dependencies
let audioCtx: AudioContext | null = null;
let currentSource: { stop: () => void } | null = null;
let gainNode: GainNode | null = null;

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function stopMusic() {
  try { currentSource?.stop(); } catch {}
  currentSource = null;
}

export function setVolume(v: number) {
  if (gainNode) gainNode.gain.value = Math.max(0, Math.min(1, v));
}

// Generate a tone-based ambient track
function createOscTrack(
  ctx: AudioContext,
  gain: GainNode,
  notes: number[],
  duration: number,
  waveform: OscillatorType = 'sine',
  tempo = 0.5
) {
  const noteLen = tempo;
  const totalNotes = Math.ceil(duration / noteLen);
  const oscillators: OscillatorNode[] = [];

  for (let i = 0; i < totalNotes; i++) {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.value = notes[i % notes.length];
    noteGain.gain.setValueAtTime(0, ctx.currentTime + i * noteLen);
    noteGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * noteLen + 0.05);
    noteGain.gain.linearRampToValueAtTime(0, ctx.currentTime + (i + 1) * noteLen - 0.05);
    osc.connect(noteGain).connect(gain);
    osc.start(ctx.currentTime + i * noteLen);
    osc.stop(ctx.currentTime + (i + 1) * noteLen);
    oscillators.push(osc);
  }

  return {
    stop: () => oscillators.forEach(o => { try { o.stop(); } catch {} }),
  };
}

export interface MusicTrack {
  id: string;
  nameKey: string; // i18n key
  emoji: string;
  category: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  // Ambient
  { id: 'ocean-waves', nameKey: 'oceanWaves', emoji: '🌊', category: 'ambient' },
  { id: 'forest-birds', nameKey: 'forestBirds', emoji: '🌲', category: 'ambient' },
  { id: 'rain-drops', nameKey: 'rainDrops', emoji: '🌧️', category: 'ambient' },
  { id: 'campfire', nameKey: 'campfire', emoji: '🔥', category: 'ambient' },
  { id: 'wind', nameKey: 'wind', emoji: '💨', category: 'ambient' },
  // Chill
  { id: 'chill-lofi', nameKey: 'chillLofi', emoji: '🎵', category: 'chill' },
  { id: 'soft-piano', nameKey: 'softPiano', emoji: '🎹', category: 'chill' },
  { id: 'dream-pad', nameKey: 'dreamPad', emoji: '☁️', category: 'chill' },
  { id: 'acoustic-sunset', nameKey: 'acousticSunset', emoji: '🌅', category: 'chill' },
  // Upbeat
  { id: 'travel-beat', nameKey: 'travelBeat', emoji: '✈️', category: 'upbeat' },
  { id: 'adventure-drums', nameKey: 'adventureDrums', emoji: '🥁', category: 'upbeat' },
  { id: 'happy-ukulele', nameKey: 'happyUkulele', emoji: '🎸', category: 'upbeat' },
  { id: 'party-dance', nameKey: 'partyDance', emoji: '🎉', category: 'upbeat' },
  // Cinematic
  { id: 'epic-orchestra', nameKey: 'epicOrchestra', emoji: '🎬', category: 'cinematic' },
  { id: 'dramatic-strings', nameKey: 'dramaticStrings', emoji: '🎻', category: 'cinematic' },
  { id: 'inspiring-rise', nameKey: 'inspiringRise', emoji: '🌟', category: 'cinematic' },
  { id: 'emotional-piano', nameKey: 'emotionalPiano', emoji: '🎶', category: 'cinematic' },
  // Cultural
  { id: 'arabic-oud', nameKey: 'arabicOud', emoji: '🪘', category: 'cultural' },
  { id: 'flamenco', nameKey: 'flamenco', emoji: '💃', category: 'cultural' },
  { id: 'asian-zen', nameKey: 'asianZen', emoji: '🎋', category: 'cultural' },
  { id: 'celtic-flute', nameKey: 'celticFlute', emoji: '🍀', category: 'cultural' },
];

export const MUSIC_CATEGORIES = ['ambient', 'chill', 'upbeat', 'cinematic', 'cultural'];

// Note frequencies for different moods
export const TRACK_NOTES: Record<string, { notes: number[]; wave: OscillatorType; tempo: number }> = {
  'ocean-waves': { notes: [174, 196, 220, 196, 174, 165], wave: 'sine', tempo: 1.2 },
  'forest-birds': { notes: [523, 659, 784, 659, 523, 440, 523, 659], wave: 'sine', tempo: 0.3 },
  'rain-drops': { notes: [880, 1047, 784, 988, 880, 1175], wave: 'sine', tempo: 0.15 },
  'campfire': { notes: [130, 147, 165, 147, 130, 110], wave: 'triangle', tempo: 0.8 },
  'wind': { notes: [110, 123, 130, 123, 110, 98], wave: 'sine', tempo: 1.5 },
  'chill-lofi': { notes: [261, 329, 392, 349, 293, 329, 261, 293], wave: 'triangle', tempo: 0.6 },
  'soft-piano': { notes: [261, 311, 349, 392, 349, 311, 261, 293], wave: 'sine', tempo: 0.8 },
  'dream-pad': { notes: [220, 261, 329, 261, 220, 196], wave: 'sine', tempo: 1.2 },
  'acoustic-sunset': { notes: [329, 392, 440, 392, 329, 293, 261, 293], wave: 'triangle', tempo: 0.5 },
  'travel-beat': { notes: [330, 392, 494, 392, 330, 440, 392, 330], wave: 'square', tempo: 0.25 },
  'adventure-drums': { notes: [110, 130, 165, 130, 110, 98, 82, 98], wave: 'sawtooth', tempo: 0.2 },
  'happy-ukulele': { notes: [392, 440, 494, 523, 494, 440, 392, 349], wave: 'triangle', tempo: 0.3 },
  'party-dance': { notes: [261, 329, 392, 523, 392, 329, 261, 196], wave: 'square', tempo: 0.18 },
  'epic-orchestra': { notes: [196, 247, 294, 349, 392, 349, 294, 247], wave: 'sawtooth', tempo: 0.7 },
  'dramatic-strings': { notes: [220, 261, 294, 349, 330, 294, 261, 220], wave: 'sawtooth', tempo: 0.9 },
  'inspiring-rise': { notes: [196, 220, 261, 294, 329, 392, 440, 494], wave: 'triangle', tempo: 0.5 },
  'emotional-piano': { notes: [261, 294, 329, 349, 329, 294, 261, 247], wave: 'sine', tempo: 0.9 },
  'arabic-oud': { notes: [220, 247, 261, 294, 330, 294, 261, 247], wave: 'triangle', tempo: 0.4 },
  'flamenco': { notes: [330, 349, 392, 440, 415, 392, 349, 330], wave: 'triangle', tempo: 0.25 },
  'asian-zen': { notes: [261, 294, 392, 440, 523, 440, 392, 294], wave: 'sine', tempo: 0.7 },
  'celtic-flute': { notes: [392, 440, 494, 523, 587, 523, 494, 440], wave: 'sine', tempo: 0.35 },
};

export function playTrack(trackId: string, duration = 30) {
  stopMusic();
  const ctx = getCtx();
  gainNode = ctx.createGain();
  gainNode.gain.value = 0.3;
  gainNode.connect(ctx.destination);

  const config = TRACK_NOTES[trackId];
  if (!config) return;

  currentSource = createOscTrack(ctx, gainNode, config.notes, duration, config.wave, config.tempo);
}

// Play custom audio from URL or blob
let customAudio: HTMLAudioElement | null = null;

export function playCustomAudio(url: string) {
  stopMusic();
  stopCustomAudio();
  customAudio = new Audio(url);
  customAudio.loop = true;
  customAudio.volume = 0.5;
  customAudio.play().catch(() => {});
}

export function stopCustomAudio() {
  if (customAudio) {
    customAudio.pause();
    customAudio.src = '';
    customAudio = null;
  }
}

export function stopAll() {
  stopMusic();
  stopCustomAudio();
}
