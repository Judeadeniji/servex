export async function parseRequestBody(request: Request) {
    // Parse the request based on Content-Type
    const contentType = request.headers.get("Content-Type") || "";
  
    if (contentType.includes("application/json")) {
      try {
        return await request.json();
      } catch (error) {
        return new Response("Invalid JSON", { status: 400 });
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      try {
        const formData = await request.formData();
        const entries: Record<string, FormDataEntryValue> = {};
        formData.forEach((v, k) => entries[k] = v) 
        return entries
      } catch (error) {
        return new Response("Invalid form data", { status: 400 });
      }
    } else if (contentType.includes("multipart/form-data")) {
      try {
        return await request.formData();
      } catch (error) {
        return new Response("Invalid multipart form data", { status: 400 });
      }
    } else {
      // For other content types or no body
      return null;
    }
  }
  