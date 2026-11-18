import { redirect } from 'next/navigation';

// 예전 '단가 관리' 주소는 '품목 관리'로 옮겼습니다.
export default function PricesRedirect() {
  redirect('/items?tab=prices');
}
