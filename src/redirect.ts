import type { StatusCode } from "./http-status";

export class Redirect extends Error {
    private url: string;
    private status: StatusCode;
    constructor(url: string, status: StatusCode = 302) {
        super();
        this.name = "Redirect";
        this.url = url;
        this.status = status;
    }
    getResponse() {
        return new Response(null, {
            status: this.status,
            headers: {
                Location: this.url,
            },
        });
    }
}

export function redirect(url: string, status: StatusCode = 302) {
    return new Redirect(url, status);
}