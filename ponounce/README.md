# Ponounce — paper spelling companion for Miori

Production: https://family.nagaita.jp/ponounce/

Single source of truth: /miori-word-garden/word-packs/current.json, published by nagaita-family/miori-word-garden. This Ponounce repository has no weekly hardcoded words. It fetches the Word Garden pack on load, Refresh and returning to the app after two minutes. A validated last-good pack is cached in this device for offline use; its offline state is labeled. Weekly Word Garden updates therefore flow to Ponounce without a second file update. Contractions with straight or curly apostrophes (e.g., `won’t`) and school phrases (e.g., `time zone`) keep their punctuation and spacing in the list while chunk boundaries still use letter-only indexes.

Audio: publicly reachable pronunciation recordings exposed by dictionaryapi.dev are prioritized (US first where identifiable); if absent or not yet retrieved on first tap, use the device English speech voice immediately. Human recording slow uses HTMLAudioElement.playbackRate 0.6 with reapplication after loading and when playback starts, plus 0.5 speech rate fallback. Different voices and browsers may vary in speed and sound. Browser behavior on iPad Safari has not yet been physically verified.

Cambridge (human voices) and Google pronunciation search open as external references without scraping or embedding their copyrighted audio. The school phonics chunks and silent-letter annotations are displayed as orthographic hints, not exact phoneme boundaries. The app does not read or change Word Garden practice history.

Use PWA Add to Home Screen on iPad. On new static releases, increment the service worker cache name to ensure offline clients refresh.
