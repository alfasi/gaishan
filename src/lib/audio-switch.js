/**
 * Audio track switcher using the native HTMLMediaElement audioTracks API.
 * Requires the Chromium "AudioVideoTracks" feature flag to be enabled.
 */

/**
 * Switch the active audio track on a video element.
 * Disables all audio tracks except the one at the given index.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {number} audioIndex - Zero-based index into videoEl.audioTracks
 */
export function switchAudioTrack(videoEl, audioIndex) {
  const tracks = videoEl.audioTracks
  if (!tracks || tracks.length === 0) {
    throw new Error('No audio tracks available (audioTracks API not supported?)')
  }
  if (audioIndex < 0 || audioIndex >= tracks.length) {
    throw new Error(`Audio index ${audioIndex} out of range (${tracks.length} tracks)`)
  }

  for (let i = 0; i < tracks.length; i++) {
    tracks[i].enabled = i === audioIndex
  }

  // Nudge the video decoder to re-sync — without this, video freezes
  // while audio continues after an audio track switch.
  videoEl.currentTime = videoEl.currentTime
}
