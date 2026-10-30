import { SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState icon={SearchX} title="Page not found" action={<Link to="/" className="btn-primary">Back to home</Link>}>
        The page you are looking for has moved or does not exist.
      </EmptyState>
    </div>
  );
}
