import { Link } from 'react-router-dom';
export function NotFoundPage() { return <main className="not-found"><h1>404</h1><p>الصفحة غير موجودة.</p><Link className="button button--primary" to="/">العودة للوحة التحكم</Link></main>; }
