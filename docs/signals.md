# Signals & Routines (Hierarchical Context)

ServeX implements a highly advanced **Hierarchical Context architecture** via `c.routine()`. If you are familiar with Go's `context` package, this will feel right at home. If you are not, think of routines as an invisible "tree" that manages the lifecycle, timeouts, and scoped variables of your background tasks.

Instead of passing variables and cancellation tokens manually through every deeply nested function call, you create a routine tree. The strict rules of this tree are:

1. **Cancellation flows DOWN:** If you cancel a parent routine (or if the user drops the HTTP connection), the parent automatically signals and cancels every single child routine nested beneath it. This entirely prevents orphaned background tasks, runaway database queries, and memory leaks.
2. **Values flow UP:** If a child routine needs a value (like a `traceId`), it will walk up the tree until it finds an ancestor that has it. Ancestors cannot see values injected into their children, allowing you to safely scope data to specific branches of execution.

Every HTTP request automatically creates a root routine tied to the browser's `AbortSignal`. You can branch off this root routine using helpers from `servex/core/signal`.

## 1. `withCancel`: Manual Branch Cancellation

You can spawn a sub-routine that can be manually aborted without affecting the parent request.

```typescript
import { withCancel } from "servex/core/signal";

app.get("/task", async (c) => {
  // Branch off the main request routine
  const [childCtx, cancel] = withCancel(c.routine());

  // Pass childCtx.signal to an external process
  fetch("https://api.example.com/long-polling", { signal: childCtx.signal }).catch(() => {});

  // Manually cancel the child routine after some condition is met
  // This does NOT cancel the parent request (c.routine())
  if (someCondition) {
    cancel(); 
  }

  return c.text("Done");
});
```

## 2. `withTimeout`: Managing Deadlines

You can use the Go-style context tree to spawn sub-routines that automatically clean up when a deadline passes or the request drops—whichever happens first.

```typescript
import { withTimeout } from "servex/core/signal";

app.get("/stream", async (c) => {
  // Create a child routine that times out after 5 seconds
  // If the user drops connection before 5s, the child is STILL aborted because cancellation flows DOWN!
  const [childCtx, cancel] = withTimeout(c.routine(), 5000);

  const timer = setInterval(() => {
    console.log("Processing heavy background task...");
  }, 1000);

  childCtx.signal.addEventListener("abort", () => {
    console.log("Routine aborted! Cleaning up interval...");
    clearInterval(timer);
  });

  return c.text("Processing started in the background.");
});
```

## 3. `withValue`: Hierarchical State

While `c.set()` is great for flat request state, `withValue` lets you scope state to a specific branch of execution. Because values flow UP, a child can always read an ancestor's value, but an ancestor cannot read a child's value.

```typescript
import { withValue } from "servex/core/signal";

app.get("/nested", async (c) => {
  // Attach a value to a new sub-routine
  const routineA = withValue(c.routine(), "traceId", "abc-123");
  
  // Attach another value deeper down
  const routineB = withValue(routineA, "userId", "999");

  // routineB can read values from routineA
  console.log(routineB.value("traceId")); // "abc-123"
  console.log(routineB.value("userId"));  // "999"

  // routineA CANNOT read values from routineB
  console.log(routineA.value("userId"));  // undefined

  return c.text("Values logged");
});
```

## 4. Composing Routines

Because routines are hierarchical, you can freely compose them to build complex execution trees. For example, you can attach a strict timeout to a background task that carries specific state, while leaving the main request completely unaffected.

```typescript
import { withValue, withTimeout } from "servex/core/signal";

app.post("/process-video", async (c) => {
  // 1. Create a branch with state specifically for the worker
  const workerState = withValue(c.routine(), "jobId", "video-889");

  // 2. Wrap that state with a strict 30-second deadline
  const [workerCtx, cancelWorker] = withTimeout(workerState, 30000);

  // The final `workerCtx` routine now has:
  // - The "jobId" value flowing UP
  // - A 30s deadline flowing DOWN
  // - Connection drop awareness flowing DOWN from the root c.routine()

  runBackgroundWorker(workerCtx).catch((err) => {
    console.error(`Job ${workerCtx.value("jobId")} failed:`, err);
  });

  // We can respond immediately to the client.
  // The workerCtx will continue in the background but will abort if the 30s deadline passes.
  return c.json({ status: "processing" });
});

async function runBackgroundWorker(ctx) {
  // Pass the fully composed signal to your heavy lifting logic
  await fetch("https://internal-worker.local/start", { signal: ctx.signal });
}
```
