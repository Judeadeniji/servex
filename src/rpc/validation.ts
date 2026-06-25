import type { StandardSchemaV1 } from '@standard-schema/spec';
import { RPCError } from './error';

export async function validateInput(
	schema: StandardSchemaV1 | null,
	data: unknown,
): Promise<unknown> {
	if (!schema) return data;

	const result = await schema['~standard'].validate(data);

	if (result.issues) {
		throw new RPCError('VALIDATION_ERROR', 'Input validation failed', {
			issues: result.issues.map((i) => ({
				message: i.message,
				path:
					i.path?.filter(
						(p): p is string | number => typeof p === 'string' || typeof p === 'number',
					) ?? null,
			})),
		});
	}

	return result.value;
}

export async function validateOutput(
	schema: StandardSchemaV1 | null,
	data: unknown,
): Promise<unknown> {
	if (!schema) return data;

	const result = await schema['~standard'].validate(data);

	if (result.issues) {
		// Output validation failure is a server-side bug, not a client error
		throw new RPCError('INTERNAL_ERROR', 'Output validation failed', {
			issues: result.issues.map((i) => ({
				message: i.message,
				path:
					i.path?.filter(
						(p): p is string | number => typeof p === 'string' || typeof p === 'number',
					) ?? null,
			})),
		});
	}

	return result.value;
}
