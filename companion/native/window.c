// Merlin's X11 adapter. Built into the VSIX; no xprop/xwininfo installation needed.
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static int ignore_error(Display *d, XErrorEvent *e) { (void)d; (void)e; return 0; }
static unsigned char *property(Display *d, Window w, const char *name, Atom type, unsigned long *n) {
  Atom actual; int format; unsigned long remaining; unsigned char *data = NULL;
  if (XGetWindowProperty(d, w, XInternAtom(d, name, False), 0, 4096, False, type,
      &actual, &format, n, &remaining, &data) != Success || actual == None) { if(data) XFree(data); return NULL; }
  return data;
}
static unsigned long scalar(Display *d, Window w, const char *name, Atom type) {
  unsigned long n = 0; unsigned char *p = property(d,w,name,type,&n);
  unsigned long value = p && n ? *(unsigned long*)p : 0; if(p) XFree(p); return value;
}
static void quote(const char *s) {
  putchar('"'); for (;*s;s++) { unsigned char c = *s; if(c=='"'||c=='\\') putchar('\\'); if(c>=32) putchar(c); }
  putchar('"');
}
int main(int argc, char **argv) {
  Display *d = XOpenDisplay(NULL); if(!d) { fprintf(stderr,"X11 display unavailable; native Wayland tracking is unsupported\n"); return 1; }
  XSetErrorHandler(ignore_error); Window root = DefaultRootWindow(d);
  Window active = scalar(d,root,"_NET_ACTIVE_WINDOW",XA_WINDOW);
  Window w = argc == 2 && strcmp(argv[1],"active") ? strtoul(argv[1],NULL,16) : active;
  XWindowAttributes a; if(!w || !XGetWindowAttributes(d,w,&a)) { XCloseDisplay(d); return 2; }
  unsigned long n=0; unsigned char *classes = property(d,w,"WM_CLASS",XA_STRING,&n);
  const char *klass = "";
  if(classes && n) { size_t first=strnlen((char*)classes,n); klass=first+1<n?(char*)classes+first+1:(char*)classes; }
  unsigned long pid=scalar(d,w,"_NET_WM_PID",XA_CARDINAL);
  unsigned long count=0; unsigned char *state=property(d,w,"_NET_WM_STATE",XA_ATOM,&count);
  Atom hidden=XInternAtom(d,"_NET_WM_STATE_HIDDEN",False); int minimized=0;
  if(state) { for(unsigned long i=0;i<count;i++) if(((Atom*)state)[i]==hidden) minimized=1; XFree(state); }
  int x=0,y=0; Window child; XTranslateCoordinates(d,w,root,0,0,&x,&y,&child);
  printf("{\"id\":\"0x%lx\",\"pid\":\"%lu\",\"class\":",w,pid); quote(klass);
  printf(",\"visible\":%s,\"bounds\":{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d}}\n",
    w==active && a.map_state==IsViewable && !minimized?"true":"false",x,y,a.width,a.height);
  if(classes) XFree(classes);
  XCloseDisplay(d);
  return 0;
}
