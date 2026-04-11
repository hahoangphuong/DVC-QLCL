export function LoginScreen({
  password,
  setPassword,
  busy,
  error,
  onSubmit,
}: {
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-800 px-6 py-5">
          <p className="text-slate-300 text-xs font-bold uppercase tracking-[0.2em]">Dashboard DAV</p>
          <h1 className="text-white text-lg font-bold mt-1">Đăng nhập truy cập hệ thống</h1>
        </div>
        <form
          className="p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu viewer hoặc admin"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="w-full rounded-xl bg-blue-600 text-white font-bold text-sm px-4 py-3 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
          <p className="text-xs text-slate-500 leading-relaxed">
            Role viewer chỉ xem thống kê. Role admin được xem thêm Tra cứu và Admin panel.
          </p>
        </form>
      </div>
    </div>
  );
}

