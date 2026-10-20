import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Presentation } from 'lucide-react';
import { SystemTour } from './SystemTour';

export function TourButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Presentation className="h-4 w-4" />
        Apresentação
      </Button>
      <SystemTour isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
