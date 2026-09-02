import "./globals.css";

export const metadata = {
  title: "DishDecider",
  description: "A shared potluck planner where everyone's agent helps coordinate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
