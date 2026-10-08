Bundled engine: eSpeak NG 1.52.0 (GPL-3.0-or-later).
Complete upstream source: espeak-ng_1.52.0+dfsg.orig.tar.gz
Source origin: https://deb.debian.org/debian/pool/main/e/espeak-ng/
The original archive is unmodified. build-native.mjs records the single CMake
conditional change (honor USE_LIBSONIC=OFF rather than fetching Sonic) and the
exact compiler/configuration flags used to build the separate engine binary.
The extra Debian patch archive is included for the original data provenance;
the current native build and generated dictionaries come from upstream source.
No Sonic/pcaudio/MBROLA support is enabled. Audio is synthesized as PCM WAV and
played through the renderer's WebAudio API. Standard C/C++ and desktop X11
libraries are operating-system prerequisites, not installed by this extension.
