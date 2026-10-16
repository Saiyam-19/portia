import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  tab: 'signin', signIn: vi.fn(), signUp: vi.fn(), assign: vi.fn(), push: vi.fn(), refresh: vi.fn(),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  // Exercise the form's submit handler without a browser or network.
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useRef: (initial: unknown) => ({current:initial}),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: fixtures.push, refresh: fixtures.refresh }),
  useSearchParams: () => new URLSearchParams({ tab: fixtures.tab }),
}));
vi.mock('@/lib/migration/auth-client', () => ({ migrationAuthClient: {
  signIn: { email: fixtures.signIn }, signUp: { email: fixtures.signUp },
} }));
import LoginForm from '../../src/components/auth/login-form';

type FormProps = { children?: React.ReactNode; onSubmit?: (event: { preventDefault(): void }) => Promise<void> };
function form(node: React.ReactNode): React.ReactElement<FormProps> | undefined {
  if (!React.isValidElement<FormProps>(node)) return;
  if (node.type === 'form') return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = form(child); if (found) return found;
  }
}
beforeEach(() => {
  vi.clearAllMocks(); fixtures.tab = 'signin';
  fixtures.signIn.mockResolvedValue({ error: null }); fixtures.signUp.mockResolvedValue({ error: null });
  vi.stubGlobal('React', React); vi.stubGlobal('window', { location: { assign: fixtures.assign } });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['signin', 'signup'])('starts a fresh authenticated document after successful %s', async tab => {
  fixtures.tab = tab;
  await form(LoginForm({ basicSignup: true }))!.props.onSubmit!({ preventDefault() {} });
  expect(fixtures.assign).toHaveBeenCalledExactlyOnceWith('/dashboard');
  expect(fixtures.push).not.toHaveBeenCalled();
  expect(fixtures.refresh).not.toHaveBeenCalled();
});
it('stays on the form after rejected credentials', async () => {
  fixtures.signIn.mockResolvedValue({ error: { message: 'Invalid credentials' } });
  await form(LoginForm({ basicSignup: true }))!.props.onSubmit!({ preventDefault() {} });
  expect(fixtures.assign).not.toHaveBeenCalled();
});
it('ignores duplicate submission while authentication is pending',async()=>{
  let finish!:(value:{error:null})=>void;
  fixtures.signIn.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const submit=form(LoginForm({basicSignup:true}))!.props.onSubmit!;
  const first=submit({preventDefault(){}}),second=submit({preventDefault(){}});
  expect(fixtures.signIn).toHaveBeenCalledTimes(1);
  finish({error:null});await Promise.all([first,second]);expect(fixtures.assign).toHaveBeenCalledTimes(1);
});
