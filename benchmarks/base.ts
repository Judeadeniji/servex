function base() {
  return new Response("Hello, world");
}

export default {
  fetch: base
};
