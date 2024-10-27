import { describe, it, expect } from 'vitest';
import { RegExpRouter } from './router';

describe('RegExpRouter', () => {
    it('should match a simple path', () => {
        const router = new RegExpRouter();
        router.add('get', '/test', 'testHandler');

        const result = router.match('get', '/test');
        expect(result[0][0][0]).toBe('testHandler');
    });

    it('should not match an incorrect path', () => {
        const router = new RegExpRouter();
        router.add('get', '/test', 'testHandler');

        const result = router.match('get', '/user');
        expect(result).toEqual([[], []]);
    });

    it('should match a path with parameters', () => {
        const router = new RegExpRouter<string>();
        router.add('get', '/user/:id', 'userHandler');

        const result = router.match('get', '/user/123');
        expect(result[0][0][0]).toBe('userHandler');
    });

    it('should extract parameters from the path', () => {
        const router = new RegExpRouter();
        router.add('get', '/user/:id', 'userHandler');

        const result = router.match('get', '/user/123');
        expect(result[0][0][1]).toEqual({ id: 1 });
    });

    it('should handle multiple routes', () => {
        const router = new RegExpRouter();
        router.add('get', '/test', 'testHandler');
        router.add('get', '/user/:id', 'userHandler');

        let result = router.match('get', '/user/123');
        expect(result[0][0][0]).toBe('userHandler');

        result = router.match('get', '/test');
        expect(result[0][0][0]).toBe('testHandler');

    });
});