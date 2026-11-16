import './globals.css';

export const metadata = {
  title: '거래명세서 관리시스템 | (주)준인산업',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
