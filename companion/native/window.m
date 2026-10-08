// CoreGraphics window metadata needs no Accessibility or screen capture access.
#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
int main(int argc, char **argv) {
  @autoreleasepool {
    pid_t front = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    BOOL active = argc != 2 || strcmp(argv[1], "active") == 0;
    CGWindowID wanted = active ? 0 : (CGWindowID)strtoul(argv[1], NULL, 16);
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    for (NSDictionary *info in windows) {
      CGWindowID wid = [info[(id)kCGWindowNumber] unsignedIntValue];
      pid_t pid = [info[(id)kCGWindowOwnerPID] intValue];
      if (active ? (pid != front || [info[(id)kCGWindowLayer] intValue] != 0 || ![info[(id)kCGWindowIsOnscreen] boolValue]) : wid != wanted) continue;
      NSRunningApplication *owner = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
      NSString *bundle = owner.bundleIdentifier;
      NSString *klass = @"";
      if ([bundle isEqualToString:@"com.microsoft.VSCode"]) klass = @"Code";
      else if ([bundle isEqualToString:@"com.microsoft.VSCodeInsiders"]) klass = @"Code - Insiders";
      else if ([bundle isEqualToString:@"com.vscodium"]) klass = @"VSCodium";
      else if ([bundle isEqualToString:@"com.visualstudio.code.oss"]) klass = @"code-oss";
      CGRect rect;
      if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)info[(id)kCGWindowBounds], &rect)) return 3;
      NSDictionary *result = @{@"id": [NSString stringWithFormat:@"0x%x", wid], @"pid": [NSString stringWithFormat:@"%d", pid], @"class": klass,
        @"visible": @(pid == front && [info[(id)kCGWindowIsOnscreen] boolValue] && !owner.hidden),
        @"bounds": @{@"x": @(rect.origin.x), @"y": @(rect.origin.y), @"width": @(rect.size.width), @"height": @(rect.size.height)}};
      NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
      fwrite(json.bytes, 1, json.length, stdout); putchar('\n'); return 0;
    }
    fprintf(stderr, "VS Code window unavailable\n"); return 2;
  }
}
