# Bundled speech source

`play-audio.c` is Merlin's MIT-licensed small PulseAudio/PipeWire PCM player.
Compile on the target Linux architecture with:

    gcc -O2 -Wall -Wextra play-audio.c -o play-audio -ldl

The eSpeak NG executable is GPL-3.0-or-later. Its full upstream source archive
`espeak-ng_1.52.0+dfsg.orig.tar.gz`, license `COPYING-espeak-ng`, and the exact
project build recipe `build-native.mjs` are included here. The synthesizer is
built statically with respect to its own libraries; standard OS C/C++ libraries
are used. Sonic, pcaudio, MBROLA and asynchronous playback are disabled.

To reproduce the synthesis engine independently, extract the archive, edit
`cmake/deps.cmake` so its Sonic FetchContent branch only runs when USE_LIBSONIC
is enabled, then run:

    cmake -S source -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_LIBSONIC=OFF -DUSE_MBROLA=OFF -DUSE_ASYNC=OFF -DBUILD_TESTING=OFF -DCMAKE_POLICY_VERSION_MINIMUM=3.10
    cmake --build build --target espeak-ng-bin data -j 4

The resulting executable is `build/src/espeak-ng`, and voice data is in
`build/espeak-ng-data`. The included build-native.mjs records the exact Sonic
patch and extraction/build/copy steps used by the project. Native window-helper
compilation at its end belongs to the optional desktop build and is unnecessary
for speech. Rebuilding is for developers; VSIX users do not need build tools.
