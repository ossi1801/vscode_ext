// MIT. PulseAudio simple API ABI (also served by PipeWire's Pulse compatibility).
// Dynamically load the desktop library; no Pulse development package at runtime.
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
typedef struct pa_simple pa_simple;
typedef struct { int format; uint32_t rate; uint8_t channels; } sample_spec;
int main(int argc, char **argv) {
  if (argc != 3) { fprintf(stderr, "Expected sample rate and channel count\n"); return 2; }
  unsigned long rate = strtoul(argv[1], NULL, 10), channels = strtoul(argv[2], NULL, 10);
  if (rate < 8000 || rate > 192000 || channels < 1 || channels > 2) return 2;
  void *library = dlopen("libpulse-simple.so.0", RTLD_NOW | RTLD_LOCAL);
  if (!library) { fprintf(stderr, "Desktop audio library unavailable: %s\n", dlerror()); return 3; }
  pa_simple *(*create)(const char *, const char *, int, const char *, const char *, const sample_spec *, const void *, const void *, int *) = dlsym(library, "pa_simple_new");
  int (*write_audio)(pa_simple *, const void *, size_t, int *) = dlsym(library, "pa_simple_write");
  int (*drain)(pa_simple *, int *) = dlsym(library, "pa_simple_drain");
  void (*release)(pa_simple *) = dlsym(library, "pa_simple_free");
  if (!create || !write_audio || !drain || !release) { dlclose(library); return 3; }
  // PA_SAMPLE_S16LE = 3; PA_STREAM_PLAYBACK = 1.
  sample_spec spec = { 3, (uint32_t)rate, (uint8_t)channels }; int error = 0;
  pa_simple *stream = create(NULL, "Merlin", 1, NULL, "Merlin speech", &spec, NULL, NULL, &error);
  if (!stream) { fprintf(stderr, "Cannot connect to desktop audio (Pulse error %d)\n", error); dlclose(library); return 4; }
  unsigned char buffer[8192]; size_t bytes, total = 0; int result = 0;
  while ((bytes = fread(buffer, 1, sizeof(buffer), stdin)) > 0) {
    if (write_audio(stream, buffer, bytes, &error) < 0) { result = 5; break; }
    total += bytes;
  }
  if (ferror(stdin) || !total) result = 5;
  if (!result && drain(stream, &error) < 0) result = 5;
  release(stream); dlclose(library);
  if (result) fprintf(stderr, "Audio playback failed (Pulse error %d)\n", error);
  else printf("{\"playedBytes\":%zu}\n", total);
  return result;
}
