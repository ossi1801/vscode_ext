#define UNICODE
#define _UNICODE
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <dwmapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
#include <string.h>
int main(int argc, char **argv) {
  // Geometry must use physical pixels, independently of the helper's manifest.
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  HWND active = GetForegroundWindow();
  HWND window = argc == 2 && strcmp(argv[1], "active") ? (HWND)(uintptr_t)_strtoui64(argv[1], NULL, 16) : active;
  DWORD pid = 0; GetWindowThreadProcessId(window, &pid);
  RECT r; if (!IsWindow(window) || !GetWindowRect(window, &r) || !pid) return 2;
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  wchar_t file[32768] = {0}; DWORD size = 32768;
  if (!process || !QueryFullProcessImageNameW(process, 0, file, &size)) { if (process) CloseHandle(process); return 3; }
  CloseHandle(process);
  wchar_t *base = wcsrchr(file, L'\\'); base = base ? base + 1 : file;
  const char *klass = "";
  if (!_wcsicmp(base, L"Code.exe")) klass = "Code";
  else if (!_wcsicmp(base, L"Code - Insiders.exe")) klass = "Code - Insiders";
  else if (!_wcsicmp(base, L"VSCodium.exe")) klass = "VSCodium";
  else if (!_wcsicmp(base, L"code-oss.exe")) klass = "code-oss";
  DWORD cloaked = 0; DwmGetWindowAttribute(window, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
  printf("{\"id\":\"0x%llx\",\"pid\":\"%lu\",\"class\":\"%s\",\"visible\":%s,\"bounds\":{\"x\":%ld,\"y\":%ld,\"width\":%ld,\"height\":%ld}}\n",
    (unsigned long long)(uintptr_t)window, (unsigned long)pid, klass,
    window == active && IsWindowVisible(window) && !IsIconic(window) && !cloaked ? "true" : "false", r.left, r.top, r.right-r.left, r.bottom-r.top);
  return 0;
}
