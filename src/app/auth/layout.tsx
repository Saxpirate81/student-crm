export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center py-10 sm:min-h-[calc(100dvh-140px)] sm:py-14">
      {children}
    </div>
  );
}
