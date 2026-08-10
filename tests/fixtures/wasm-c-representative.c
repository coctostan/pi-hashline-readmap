#include <stdlib.h>

#define BUFFER_LIMIT 4096
#define CLAMP(v, lo, hi) ((v) < (lo) ? (lo) : ((v) > (hi) ? (hi) : (v)))

typedef int (*handler_t)(void *ctx,
                         int flags,
                         const char *name);

typedef struct node {
  struct node *next;
  int payload;
} node_t;

enum status { STATUS_OK, STATUS_ERR };

union packet {
  unsigned char raw[8];
  unsigned long word;
};


typedef union {
  long bits;
} Bits;

struct {
  int scratch;
} anonymous_slot;

static handler_t registered_handler;

__attribute__((noreturn)) void fatal(const char *message);

__attribute__((pure)) int checksum(const unsigned char *data, int len);

int legacy_sum(a, b)
    int a;
    int b;
{
  return a + b;
}

static int clamp_value(int value) {
  return CLAMP(value, 0, BUFFER_LIMIT);
}

int dispatch(handler_t handler,
             void *ctx,
             int flags) {
  if (handler == NULL) {
    return STATUS_ERR;
  }
  return handler(ctx, flags, "dispatch");
}
