import type { Module } from '../../types';

const raw = String.raw;

export const typescriptModule: Module = {
  id: 'web-typescript',
  title: 'TypeScript for Production Systems',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-ts-structural-unions',
      title: 'Structural Typing, Discriminated Unions & Narrowing',
      summary: 'How TypeScript decides compatibility by shape, how to model state so impossible combinations cannot compile, and how control flow narrows a union to exactly one case.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 110,
      analogy:
        "TypeScript checks shapes, not name tags: if something has the right sockets, it fits the plug, whatever brand is printed on it. A discriminated union is a set of labelled boxes: each box has a tag on the outside (`status: 'loading'`) and once you read the tag you know exactly what is inside. Narrowing is the compiler reading the tag with you.",
      intuition: [
        { title: 'Structural typing', body: "A value is assignable to a type if it has at least the required properties with compatible types. Two interfaces with identical shapes are interchangeable. (Fresh object literals get an extra \"excess property\" check that catches typos.)" },
        { title: 'Unions describe alternatives', body: "`string | number` means one or the other. Before using type-specific operations, narrow with `typeof`, `instanceof`, `in`, equality, or truthiness checks; the compiler tracks the narrowed type through `if`, `switch` and early returns." },
        { title: 'Discriminated unions', body: "Give each variant a literal tag: `{ status: 'idle' } | { status: 'loading' } | { status: 'success'; data: User } | { status: 'error'; error: string }`. Checking `state.status` narrows to one variant, and `data` only exists where it makes sense." },
        { title: 'Make impossible states unrepresentable', body: "A bag of optionals (`{ loading: boolean; data?: User; error?: string }`) allows `loading: true` with an error and data at the same time. A union makes those states compile errors instead of runtime bugs." },
        { title: 'Exhaustiveness with never', body: "In the `default` branch, assign the value to a `never` variable. If someone adds a new variant and forgets to handle it, the build fails at that line." },
        { title: 'Custom guards', body: "`function isUser(x: unknown): x is User` teaches the compiler a new narrowing; `asserts x is User` narrows after a call that throws on failure. Guards are promises you must keep: they are only as correct as their runtime check." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Narrowing a request-state union', body: 'Each check removes variants until exactly one remains.', flow: ['RequestState (4 variants)', "status === 'success' ?", 'yes → { data: User }', "status === 'error' ?", 'yes → { error: string }', 'default → never (exhaustive)'] },
        { kind: 'tip', title: 'Turn on the strict family', body: '`strict: true` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` catch the bugs this chapter is about. Turn them on for new projects; migrate old ones directory by directory.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'unions_and_narrowing.ts',
          explanation: 'Runnable and compile-checked TypeScript: structural compatibility, an excess-property error, a discriminated union with exhaustive switch, typeof/in/instanceof narrowing and a custom type guard. Lines marked @ts-expect-error are proven to be compile errors by tsc --strict; runtime results are asserted.',
          code: raw`//  NARROWING
//
//   RequestState = idle | loading | success{data} | error{error}
//        |
//        +-- status === 'success' --> data: User available
//        +-- status === 'error'   --> error: string available
//        +-- default              --> never  (compile error if a variant is unhandled)
import assert from 'node:assert/strict';

// 1) structural typing: shape matters, names don't
interface Point { x: number; y: number }
interface Vector { x: number; y: number }
const v: Vector = { x: 1, y: 2 };
const p: Point = v;                                  // OK: same shape
const withExtra = { x: 1, y: 2, label: 'origin' };
const p2: Point = withExtra;                         // OK: extra props allowed on non-fresh objects
// @ts-expect-error  excess property check on a fresh literal catches the typo
const p3: Point = { x: 1, y: 2, lable: 'oops' };
void p3;

// 2) discriminated union
type User = { id: string; name: string };
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string };

function describe(s: RequestState): string {
  switch (s.status) {
    case 'idle': return 'Nothing yet';
    case 'loading': return 'Loading...';
    case 'success': return 'Hello ' + s.data.name;   // data exists only here
    case 'error': return 'Failed: ' + s.error;
    default: {
      const unreachable: never = s;                  // add a variant -> compile error here
      return unreachable;
    }
  }
}
assert.equal(describe({ status: 'success', data: { id: '1', name: 'Ada' } }), 'Hello Ada');
assert.equal(describe({ status: 'error', error: 'timeout' }), 'Failed: timeout');
// @ts-expect-error  'data' does not exist on the loading variant
const impossible: RequestState = { status: 'loading', data: { id: '1', name: 'x' } };
void impossible;

// 3) built-in narrowing
function format(input: string | number | Date | { iso: string }): string {
  if (typeof input === 'string') return input.toUpperCase();
  if (typeof input === 'number') return input.toFixed(2);
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return input.iso;                                  // only { iso } is left
}
assert.deepEqual([format('ok'), format(3.14159), format(new Date(Date.UTC(2026, 0, 2))), format({ iso: 'x' })],
  ['OK', '3.14', '2026-01-02', 'x']);

// 4) custom type guard + assertion function
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null && typeof (x as User).id === 'string' && typeof (x as User).name === 'string';
}
function assertUser(x: unknown): asserts x is User {
  if (!isUser(x)) throw new TypeError('not a user');
}
const parsed: unknown = JSON.parse('{"id":"7","name":"Lin"}');
assertUser(parsed);
assert.equal(parsed.name, 'Lin');                    // narrowed to User after the assertion
assert.throws(() => assertUser({ id: 7 }), TypeError);
console.log(describe({ status: 'loading' }), '|', format(new Date(Date.UTC(2026, 0, 2))), '|', p2.x + p.y);`,
        },
        production: {
          language: 'tsx',
          filename: 'useUser.tsx',
          explanation: 'Production React + TypeScript: a reducer over a discriminated union (illegal transitions are ignored), an exhaustive render switch, and a component that can only access data in the success branch.',
          code: raw`import { useEffect, useReducer } from 'react';

type User = { id: string; name: string; email: string };
// every legal UI state, each with exactly the data it needs
type State =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string; retryable: boolean };

type Action =
  | { type: 'fetch' }
  | { type: 'resolve'; data: User }
  | { type: 'reject'; error: string; retryable: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':
      return { status: 'loading', startedAt: Date.now() };
    case 'resolve':
      return state.status === 'loading' ? { status: 'success', data: action.data } : state;  // ignore late results
    case 'reject':
      return state.status === 'loading' ? { status: 'error', error: action.error, retryable: action.retryable } : state;
    default: {
      const never: never = action;                 // new action type? the build fails here
      return never;
    }
  }
}

export function UserCard({ id }: { id: string }) {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  // fetch on id change; abort the previous request in the cleanup

  useEffect(() => {
    const ctrl = new AbortController();
    dispatch({ type: 'fetch' });
    fetch('/api/users/' + id, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data: User) => dispatch({ type: 'resolve', data }))
      .catch((e: Error) => { if (e.name !== 'AbortError') dispatch({ type: 'reject', error: e.message, retryable: true }); });
    return () => ctrl.abort();
  }, [id]);

  switch (state.status) {
    case 'idle':
    case 'loading': return <p aria-busy="true">Loading…</p>;
    case 'error': return <p role="alert">{state.error}{state.retryable && ' (retry?)'}</p>;
    case 'success': return <h2>{state.data.name}</h2>;   // state.data is only reachable here
  }
}`,
        },
        bug: {
          explanation:
            'A bag of independent booleans and optionals allows contradictory states (loading and error at once, stale data shown with an error), and the UI has to guess which flag wins; data is also typed as possibly undefined everywhere. A discriminated union makes each state explicit and lets the compiler enforce correct access.',
          buggy: {
            language: 'ts',
            filename: 'state.ts',
            code: raw`// ❌ 2 x 2 x 2 = 8 combinations, most of them nonsense
type State = {
  loading: boolean;
  error?: string;
  data?: User;
};
// { loading: true, error: 'x', data: user } compiles fine; what should the UI show?
const title = state.data!.name;      // non-null assertion: crashes when data is missing`,
          },
          fixed: {
            language: 'ts',
            filename: 'state.ts',
            code: raw`// ✅ Exactly four legal states; access is checked by the compiler
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string };

const title = state.status === 'success' ? state.data.name : 'Loading';`,
          },
        },
      },
      takeaways: [
        'TypeScript is structural: compatible shapes are assignable; fresh literals get excess-property checks.',
        'Model state as a discriminated union so impossible states do not compile.',
        'Narrow with typeof, instanceof, in, equality and custom guards; finish switches with a never check.',
        'Type guards are only as correct as their runtime checks.',
        'Practice drill: add { status: \'cancelled\' } to RequestState in Tab 1 and confirm tsc reports the never assignment in describe(); then handle it.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-ts-generics-utility',
      title: 'Generics, Utility Types & satisfies',
      summary: 'Write functions and types that work for many shapes without losing precision: constraints, keyof, mapped and conditional types, the built-in utility types, and satisfies for checked-but-precise config.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "A generic is a labelled shipping container: the container's design is the same for every cargo, but the label (`Box<Shoes>`) tells everyone exactly what is inside, so nothing has to be unpacked and inspected. Utility types are the stencils for making new labels from old ones: \"the same as User, but without the password\", \"the same, but every field optional\".",
      intuition: [
        { title: 'Type parameters capture relationships', body: "`function first<T>(xs: T[]): T | undefined` says the output type is tied to the input type. Without generics you would choose between `any` (no safety) and one fixed type (no reuse)." },
        { title: 'Constraints and keyof', body: "`function get<T, K extends keyof T>(obj: T, key: K): T[K]` only accepts real keys and returns the exact property type. `T[K]` is an indexed access type." },
        { title: 'The utility types you will use weekly', body: "`Partial<T>`, `Required<T>`, `Readonly<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>`, `ReturnType<F>`, `Parameters<F>`, `Awaited<P>`, `NonNullable<T>`. They are ordinary mapped/conditional types you could write yourself." },
        { title: 'Mapped and conditional types', body: "`{ [K in keyof T]: T[K] | null }` transforms every property. `T extends string ? 'text' : 'other'` chooses a type; with `infer` it extracts parts (`T extends Promise<infer U> ? U : T`)." },
        { title: 'satisfies: checked, but not widened', body: "`const routes = { home: '/', user: '/users/:id' } satisfies Record<string, string>` checks the object against the type while keeping its literal keys and values. An annotation (`: Record<string, string>`) would widen the keys to any string and lose autocomplete and typo detection." },
        { title: 'Know when to stop', body: "Types exist to catch bugs and document intent. If a type needs a page of explanation, a simpler type plus a runtime check is often better engineering." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Deriving types from one source of truth', body: 'Define the domain type once and derive the API shapes from it, so they cannot drift apart.', flow: ['User (domain)', "Omit<User, 'passwordHash'> → PublicUser", "Pick<User, 'name' | 'email'> → CreateUserInput", 'Partial<CreateUserInput> → UpdateUserInput', 'Record<Role, Permission[]>'] },
        { kind: 'tip', title: 'Test your types', body: 'Type-level tests (an Equal helper plus an Expect wrapper, as in Tab 1) run in tsc and fail the build when a refactor changes a derived type unexpectedly.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'generics_from_scratch.ts',
          explanation: 'Runnable and compile-checked TypeScript: generic functions with constraints, home-made versions of Pick/Partial/ReturnType/Awaited verified equal to the built-ins with type-level tests, and satisfies vs annotation. Compile-time claims are checked by tsc --strict; runtime values are asserted.',
          code: raw`//  ONE SOURCE OF TRUTH
//
//   User --Omit<'passwordHash'>--> PublicUser
//        --Pick<'name'|'email'>--> CreateUserInput --Partial--> UpdateUserInput
//   type tests:  Expect<Equal<MyPick<User, 'id'>, Pick<User, 'id'>>>  (fails the build if wrong)
import assert from 'node:assert/strict';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// 1) generic functions keep the relationship between input and output
function first<T>(xs: readonly T[]): T | undefined { return xs[0]; }
function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
const n = first([10, 20]);                       // number | undefined
const user = { id: 'u1', name: 'Ada', age: 36, passwordHash: 'x' };
const age = get(user, 'age');                     // number
// @ts-expect-error  'agee' is not a key of user
get(user, 'agee');
assert.equal(n, 10);
assert.equal(age + 1, 37);

// 2) utility types are ordinary mapped / conditional types
type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
type MyPartial<T> = { [P in keyof T]?: T[P] };
type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;
type MyAwaited<P> = P extends Promise<infer U> ? MyAwaited<U> : P;
type User = typeof user;
type _t1 = Expect<Equal<MyPick<User, 'id' | 'name'>, Pick<User, 'id' | 'name'>>>;
type _t2 = Expect<Equal<MyPartial<User>, Partial<User>>>;
type _t3 = Expect<Equal<MyReturnType<typeof first<string>>, string | undefined>>;
type _t4 = Expect<Equal<MyAwaited<Promise<Promise<number>>>, number>>;

type PublicUser = Omit<User, 'passwordHash'>;
const toPublic = ({ passwordHash: _omit, ...rest }: User): PublicUser => rest;
assert.deepEqual(Object.keys(toPublic(user)), ['id', 'name', 'age']);
type _t5 = Expect<Equal<keyof PublicUser, 'id' | 'name' | 'age'>>;

// 3) Record + a generic that groups by any key
function groupBy<T, K extends PropertyKey>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}
const byParity = groupBy([1, 2, 3, 4, 5], (x) => (x % 2 ? 'odd' : 'even'));
assert.deepEqual(byParity, { odd: [1, 3, 5], even: [2, 4] });

// 4) satisfies: validated against the type, but literal types are kept
type Route = { path: string; auth: boolean };
const annotated: Record<string, Route> = { home: { path: '/', auth: false } };
const routes = {
  home: { path: '/', auth: false },
  settings: { path: '/settings', auth: true },
} satisfies Record<string, Route>;
const okKey: keyof typeof routes = 'settings';
// @ts-expect-error  typo caught: keys are precise with satisfies
const badKey: keyof typeof routes = 'setings';
const anyKey: keyof typeof annotated = 'setings'; // no error: annotation widened keys to string
void badKey;
assert.equal(routes[okKey].auth, true);
assert.equal(annotated[anyKey], undefined);        // the typo only shows up at runtime
console.log('groupBy', byParity, '| routes', Object.keys(routes));`,
        },
        production: {
          language: 'ts',
          filename: 'api-client.ts',
          explanation: 'Production typed API client: one route table declared with satisfies, request/response types derived from it with indexed access and conditional types, and a generic fetch wrapper that rejects wrong paths, methods and bodies at compile time.',
          code: raw`type User = { id: string; name: string; email: string; role: 'admin' | 'member' };
type NewUser = Pick<User, 'name' | 'email'>;
type ApiError = { error: { code: string; message: string } };

// Single source of truth for every endpoint
const endpoints = {
  'GET /users': { response: [] as User[] },
  'GET /users/:id': { response: {} as User },
  'POST /users': { body: {} as NewUser, response: {} as User },
  'PATCH /users/:id': { body: {} as Partial<NewUser>, response: {} as User },
} satisfies Record<string, { body?: unknown; response: unknown }>;

type Endpoints = typeof endpoints;
type Key = keyof Endpoints;                                         // exact union of route keys
type BodyOf<K extends Key> = Endpoints[K] extends { body: infer B } ? B : never;
type ResponseOf<K extends Key> = Endpoints[K]['response'];

// Fill ':param' segments from a params object
function buildPath(template: string, params: Record<string, string> = {}) {
  return template.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));
}

export async function api<K extends Key>(
  key: K,
  opts: { params?: Record<string, string> } & ([BodyOf<K>] extends [never] ? { body?: never } : { body: BodyOf<K> }),
): Promise<ResponseOf<K>> {
  const [method, template] = (key as string).split(' ');
  const res = await fetch('/api' + buildPath(template, opts.params), {
    method,
    headers: { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    const err = (await res.json()) as ApiError;
    throw new Error(err.error.code + ': ' + err.error.message);
  }
  return (await res.json()) as ResponseOf<K>;                      // validate at runtime too (next chapter)
}

// usage: all of these are checked at compile time
const created = await api('POST /users', { body: { name: 'Ada', email: 'ada@example.com' } });
const one = await api('GET /users/:id', { params: { id: created.id } });
// api('POST /users', { body: { name: 'Ada' } })          -> error: email missing
// api('DELETE /users/:id', {})                            -> error: no such endpoint`,
        },
        bug: {
          explanation:
            'Annotating a config object with Record<string, ...> (or casting with as) widens its keys to string, so a misspelled key compiles and quietly returns undefined at runtime. satisfies checks the same constraint but keeps the exact keys, turning the typo into a compile error.',
          buggy: {
            language: 'ts',
            filename: 'feature-flags.ts',
            code: raw`// ❌ Keys widened to string: typos compile, return undefined at runtime
const flags: Record<string, boolean> = {
  newCheckout: true,
  darkMode: false,
};
if (flags.newChekout) enableNewCheckout();     // never runs; no error anywhere`,
          },
          fixed: {
            language: 'ts',
            filename: 'feature-flags.ts',
            code: raw`// ✅ Checked against the type, keys stay precise
const flags = {
  newCheckout: true,
  darkMode: false,
} satisfies Record<string, boolean>;
if (flags.newCheckout) enableNewCheckout();    // flags.newChekout is now a compile error`,
          },
        },
      },
      takeaways: [
        'Generics preserve the relationship between inputs and outputs; constrain with extends and keyof.',
        'Pick, Omit, Partial, Record, ReturnType and Awaited are mapped/conditional types you can derive from one domain type.',
        'satisfies validates a value against a type without widening its literal keys and values.',
        'Write type-level tests for important derived types.',
        'Practice drill: write MyOmit<T, K> using Pick and Exclude, add a type test comparing it to Omit<User, "passwordHash">, and make tsc pass.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-ts-runtime-validation',
      title: 'Runtime Schema Validation at API Boundaries',
      summary: 'Types disappear at runtime, so every byte from the network, a form, localStorage or the environment must be validated. Build a tiny schema library to see how it works, then use Zod in production.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "TypeScript types are the architect's drawings; validation is the building inspector at the door. The drawings say every delivery will be a 2-metre steel beam, but what actually arrives on the truck is whatever the supplier sent. At every entrance to your system (HTTP requests, API responses, forms, environment variables, storage), the inspector checks the delivery before it enters the building.",
      intuition: [
        { title: 'Types are erased', body: "After compilation, `const body = req.body as CreateUser` is just `const body = req.body`. The cast is a promise to the compiler, not a check. If the client sends `{ \"age\": \"thirty\" }`, your code receives exactly that." },
        { title: 'Validate at the boundary, trust inside', body: "Parse untrusted input once, where it enters (route handler, fetch response, env loader). Inside the system, typed values can be trusted. This is \"parse, don't validate\": the parser returns a new, well-typed value or an error." },
        { title: 'One schema, two products', body: "Libraries like Zod, Valibot and ArkType define a schema at runtime and infer the static type from it (`z.infer<typeof Schema>`), so the type and the check can never disagree." },
        { title: 'Coercion and transforms', body: "Query strings and form fields are always strings. Coerce deliberately (`'42'` → 42, `'true'` → true), trim, normalise email case, and apply defaults in the schema so handlers receive clean values." },
        { title: 'Good error messages are part of the API', body: "Return 422 with a list of issues `{ path: ['items', 0, 'qty'], message: 'must be ≥ 1' }` so clients can show errors next to the right field." },
        { title: 'Security boundary', body: "Reject unknown keys (or strip them) to prevent mass assignment (`{ \"role\": \"admin\" }` sneaking into an update), cap string and array lengths to limit abuse, and never pass unvalidated input to SQL, shell or HTML." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Validation boundaries', body: 'Everything crossing a dashed line is untrusted until parsed.', flow: ['HTTP body / query / params', 'schema.safeParse()', '422 with issues  OR  typed value', 'business logic (trusted types)', 'DB / external API responses also parsed'] },
        { kind: 'security', title: 'Mass assignment', body: 'Spreading a request body into a database update (`db.users.update(id, req.body)`) lets clients set fields you never meant to expose, such as role, balance or tenant id. Validate with a strict schema that lists exactly the editable fields.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'mini_schema_from_scratch.ts',
          explanation: 'Runnable TypeScript: a tiny Zod-like schema library built from scratch (string, number, object, array, optional, coercion), with static types inferred from schemas (checked by tsc) and runtime parsing that returns path-aware issues. Every result is asserted.',
          code: raw`//  PARSE, DON'T VALIDATE
//
//   unknown JSON --> schema.parse() --+--> { ok: true,  value: CreateOrder }   (typed!)
//                                     +--> { ok: false, issues: [{ path, message }] }
//   Infer<typeof schema> derives the static type from the runtime schema
import assert from 'node:assert/strict';

type Issue = { path: (string | number)[]; message: string };
type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };
interface Schema<T> { parse(input: unknown, path?: (string | number)[]): Result<T> }
type Infer<S> = S extends Schema<infer T> ? T : never;

const fail = (path: (string | number)[], message: string): Result<never> => ({ ok: false, issues: [{ path, message }] });

const s = {
  string: (opts: { min?: number; max?: number } = {}): Schema<string> => ({
    parse: (x, path = []) => {
      if (typeof x !== 'string') return fail(path, 'expected string');
      const t = x.trim();
      if (opts.min !== undefined && t.length < opts.min) return fail(path, 'too short');
      if (opts.max !== undefined && t.length > opts.max) return fail(path, 'too long');
      return { ok: true, value: t };
    },
  }),
  coerceInt: (opts: { min?: number } = {}): Schema<number> => ({
    parse: (x, path = []) => {
      const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
      if (typeof n !== 'number' || !Number.isInteger(n)) return fail(path, 'expected integer');
      if (opts.min !== undefined && n < opts.min) return fail(path, 'must be >= ' + opts.min);
      return { ok: true, value: n };
    },
  }),
  optional: <T extends unknown>(inner: Schema<T>): Schema<T | undefined> => ({
    parse: (x, path = []) => (x === undefined ? { ok: true, value: undefined } : inner.parse(x, path)),
  }),
  array: <T extends unknown>(item: Schema<T>, opts: { max: number }): Schema<T[]> => ({
    parse: (x, path = []) => {
      if (!Array.isArray(x)) return fail(path, 'expected array');
      if (x.length > opts.max) return fail(path, 'too many items');
      const out: T[] = [], issues: Issue[] = [];
      x.forEach((el, i) => { const r = item.parse(el, [...path, i]); if (r.ok) out.push(r.value); else issues.push(...r.issues); });
      return issues.length ? { ok: false, issues } : { ok: true, value: out };
    },
  }),
  object: <S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> => ({
    parse: (x, path = []) => {
      if (typeof x !== 'object' || x === null || Array.isArray(x)) return fail(path, 'expected object');
      const out: Record<string, unknown> = {}, issues: Issue[] = [];
      for (const key of Object.keys(x)) if (!(key in shape)) issues.push({ path: [...path, key], message: 'unknown key' });
      for (const [key, schema] of Object.entries(shape)) {
        const r = schema.parse((x as Record<string, unknown>)[key], [...path, key]);
        if (r.ok) out[key] = r.value; else issues.push(...r.issues);
      }
      return issues.length ? { ok: false, issues } : { ok: true, value: out as { [K in keyof S]: Infer<S[K]> } };
    },
  }),
};

const CreateOrder = s.object({
  customer: s.string({ min: 1, max: 80 }),
  note: s.optional(s.string({ max: 200 })),
  items: s.array(s.object({ sku: s.string({ min: 3 }), qty: s.coerceInt({ min: 1 }) }), { max: 50 }),
});
type CreateOrder = Infer<typeof CreateOrder>;
const typed: CreateOrder = { customer: 'Ada', note: undefined, items: [{ sku: 'A-1', qty: 2 }] };   // compile-time check

const good = CreateOrder.parse(JSON.parse('{"customer":"  Ada ","items":[{"sku":"A-100","qty":"2"}]}'));
assert.ok(good.ok);
if (good.ok) assert.deepEqual(good.value, { customer: 'Ada', note: undefined, items: [{ sku: 'A-100', qty: 2 }] });

const bad = CreateOrder.parse({ customer: '', items: [{ sku: 'A-100', qty: 0 }, { sku: 'x', qty: 'two' }], role: 'admin' });
assert.ok(!bad.ok);
if (!bad.ok) assert.deepEqual(bad.issues, [
  { path: ['role'], message: 'unknown key' },                        // mass assignment blocked
  { path: ['customer'], message: 'too short' },
  { path: ['items', 0, 'qty'], message: 'must be >= 1' },
  { path: ['items', 1, 'sku'], message: 'too short' },
  { path: ['items', 1, 'qty'], message: 'expected integer' },
]);
console.log('typed example', typed.items.length, '| issues:', bad.ok ? 0 : bad.issues.length);`,
        },
        production: {
          language: 'ts',
          filename: 'orders.route.ts',
          explanation: 'Production pattern with Zod 4: strict request schemas with coercion and limits, inferred types, a reusable validation helper that returns 422 issues, validation of an upstream API response, and fail-fast environment parsing at startup.',
          code: raw`// npm i zod
import { z } from 'zod';
import type { Request, Response } from 'express';

// 1) Environment: crash at boot, not at 3 a.m. on first use
const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']),
});
export const env = Env.parse(process.env);

// 2) Request schema: strict (unknown keys rejected), coerced, bounded
const CreateOrder = z.strictObject({
  customerEmail: z.email().transform((e) => e.toLowerCase()),
  note: z.string().trim().max(500).optional(),
  items: z.array(z.strictObject({
    sku: z.string().regex(/^[A-Z]-\d{3,}$/),
    qty: z.coerce.number().int().min(1).max(99),
  })).min(1).max(50),
});
export type CreateOrder = z.infer<typeof CreateOrder>;

function validate<S extends z.ZodType>(schema: S, input: unknown, res: Response): z.infer<S> | undefined {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  res.status(422).json({
    error: { code: 'validation_failed', issues: r.error.issues.map((i) => ({ path: i.path, message: i.message })) },
  });
  return undefined;
}

// 3) Upstream responses are untrusted too
const PriceQuote = z.object({ sku: z.string(), unitCents: z.number().int().nonnegative() });

export async function createOrder(req: Request, res: Response) {
  const input = validate(CreateOrder, req.body, res);
  if (!input) return;                                         // 422 already sent
  const quotes = await Promise.all(input.items.map(async (it) =>
    PriceQuote.parse(await (await fetch('https://pricing.internal/quote/' + it.sku)).json())));
  const totalCents = quotes.reduce((sum, q, i) => sum + q.unitCents * input.items[i].qty, 0);
  const order = await db.orders.insert({ ...input, totalCents });   // only validated fields reach the DB
  res.status(201).json(order);
}`,
        },
        bug: {
          explanation:
            'A type assertion (as) performs no runtime check: a client can send extra fields such as role or tenantId, or wrong types such as qty: "lots", and they flow straight into the database update (mass assignment). Parse the body with a strict schema that lists exactly the editable fields.',
          buggy: {
            language: 'ts',
            filename: 'profile.route.ts',
            code: raw`// ❌ "as" is not validation: { "role": "admin" } is happily written to the DB
type UpdateProfile = { displayName: string; bio?: string };

app.patch('/api/me', async (req, res) => {
  const body = req.body as UpdateProfile;
  const user = await db.users.update(req.user.id, body);   // every client-sent field is applied
  res.json(user);
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'profile.route.ts',
            code: raw`// ✅ Strict schema: exactly two editable fields, bounded, trimmed
import { z } from 'zod';

const UpdateProfile = z.strictObject({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280).optional(),
});

app.patch('/api/me', async (req, res) => {
  const r = UpdateProfile.safeParse(req.body);
  if (!r.success) return res.status(422).json({ error: { code: 'validation_failed', issues: r.error.issues } });
  res.json(await db.users.update(req.user.id, r.data));
});`,
          },
        },
      },
      takeaways: [
        'Types are erased at runtime; `as` is a promise to the compiler, not a check.',
        'Parse untrusted data once at each boundary (requests, responses, forms, env, storage) and trust types inside.',
        'Infer static types from runtime schemas so they never drift apart.',
        'Strict schemas prevent mass assignment; bound lengths; return 422 with path-aware issues.',
        'Practice drill: add an email field to CreateOrder in Tab 1 with a minimal check (contains "@" and "."), add a failing and a passing assertion, and keep tsc --strict clean.',
      ],
    },
  ],
};
