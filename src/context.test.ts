import { describe, it, expect, beforeEach } from 'vitest';
import { Context } from './context';
import { type RequestContext } from './types';

// ./context.test.ts

describe('Context', () => {
    let request: Request;
    let variables: Record<string, any>;
    let ctx: Partial<RequestContext<any>>;
    let context: Context<any, any, any>;

    beforeEach(() => {
        request = new Request('https://example.com', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        variables = { VAR1: 'value1' };
        ctx = {
            params: { id: '123' },
            query: new URLSearchParams('q=test'),
            routeId: undefined,
            globals: new Map(),
        };
        context = new Context(request, variables, ctx as RequestContext<any>);
    });

    it('should return the original request object', () => {
        expect(context.req).toBe(request);
    });

    it('should return environment variables', () => {
        expect(context.env()).toEqual(variables);
    });

    it('should return route parameters', () => {
        expect(context.params('id')).toBe('123');
    });

    it('should return query parameters', () => {
        expect(context.query('q')).toBe('test');
    });

    it('should set and get local bindings', () => {
        context.locals.set('key', 'value');
        expect(context.locals('key')).toBe('value');
    });

    it('should set headers', () => {
        context.setHeaders({ 'X-Custom-Header': 'value' });
        expect(context.res.headers.get('X-Custom-Header')).toBe('value');
    });

    it('should set cookies', () => {
        context.setCookie('name', 'value');
        expect(context.res.headers.get('Set-Cookie')).toContain('name=value');
    });

    it('should return a JSON response', () => {
        const response = context.json({ key: 'value' });
        expect(response.headers.get('Content-Type')).toBe('application/json; charset=UTF-8');
        expect(response.status).toBe(200);
    });

    it('should return a text response', () => {
        const response = context.text('Hello, world!');
        expect(response.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8');
        expect(response.status).toBe(200);
    });

    it('should return an HTML response', () => {
        const response = context.html('<p>Hello, world!</p>');
        expect(response.headers.get('Content-Type')).toBe('text/html; charset=UTF-8');
        expect(response.status).toBe(200);
    });

    it('should return a redirect response', () => {
        const response = context.redirect('https://example.com');
        expect(response.headers.get('Location')).toBe('https://example.com');
        expect(response.status).toBe(302);
    });

    it('should return a streaming response', () => {
        const stream = new ReadableStream();
        const response = context.stream(stream);
        expect(response.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8');
        expect(response.status).toBe(200);
    });
});