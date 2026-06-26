export type Ok<T> = {
	readonly isOk: true;
	readonly isErr: false;
	readonly value: T;
	unwrap(): T;
};

export type Err<E> = {
	readonly isOk: false;
	readonly isErr: true;
	readonly error: E;
	unwrap(): never;
};

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
	return {
		isOk: true,
		isErr: false,
		value,
		unwrap: () => value,
	};
}

export function err<E>(error: E): Err<E> {
	return {
		isOk: false,
		isErr: true,
		error,
		unwrap: () => {
			throw error;
		},
	};
}
