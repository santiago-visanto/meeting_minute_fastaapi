'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Attendee = {
  name: string;
  position: string;
  role: string;
};

type Task = {
  responsible: string;
  date: string;
  description: string;
};

type MinutesData = {
  title: string;
  date: string;
  attendees: Array<Attendee>;
  summary: string;
  takeaways: Array<string>;
  conclusions: Array<string>;
  next_meeting: Array<string>;
  tasks: Array<Task>;
  message: string;
};

type FileOrNull = File | null;

export default function GenerateMinutes() {
  const [file, setFile] = useState<FileOrNull>(null);
  const [critique, setCritique] = useState<string>('');
  const [processedCritiques, setProcessedCritiques] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<MinutesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCritique, setIsSendingCritique] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    if (file !== null) {
      formData.append('file', file);
    }

    try {
      const response = await fetch('http://localhost:8000/generate_minutes/', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setMinutes(data);
        if (data.critique) {
          setProcessedCritiques([data.critique]);
          setCritique(data.critique); // Actualiza el textarea con la crítica
        }
      } else {
        const errorData = await response.json();
        setError(`Error generando acta: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error de red al generar acta');
    }

    setIsLoading(false);
  };

  const handleSendCritique = async () => {
    if (!minutes || !file) {
      setError("No hay acta o archivo para procesar.");
      return;
    }

    setIsSendingCritique(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('critique', critique);
    formData.append('article', JSON.stringify(minutes));

    try {
      const response = await fetch('http://localhost:8000/process_critique/', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setMinutes(data);
        if (data.critique) {
          setProcessedCritiques(prevCritiques => [...prevCritiques, data.critique]);
          setCritique(data.critique); // Actualiza el textarea con la crítica
        }
        setCritique(''); // Limpiar el campo de crítica actual
        alert('Crítica procesada con éxito');
      } else {
        const errorData = await response.json();
        console.error('Error processing critique:', errorData);
        setError(`Error al procesar la crítica: ${errorData.detail || response.statusText}`);
        // Si hay un mensaje de error en el acta, mostrarlo también
        if (errorData.message) {
          setError(prev => `${prev}\n${errorData.message}`);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error de red al procesar la crítica');
    }
    setIsSendingCritique(false);
  };

  const handleSave = async () => {
    alert('Actas guardadas');
  };

  const handleRestart = () => {
    setFile(null);
    setMinutes(null);
    setCritique('');
    setProcessedCritiques([]);
    setError(null);
    router.refresh();
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Elaboración de actas de reunión</h1>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!minutes ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Generar Acta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="file">Selecciona el documento:</Label>
                <Input
                  type="file"
                  id="file"
                  accept=".pdf,.txt"
                  onChange={handleFileChange}
                  className="mt-2"
                />
              </div>

              <Button type="submit" disabled={!file || isLoading} className="mt-4">
                {isLoading ? 'Generando...' : 'Generar Acta'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{minutes.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p><strong>Fecha:</strong> {minutes.date}</p>

            <div>
              <h3 className="font-semibold mb-2">Asistentes:</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Posición</TableHead>
                    <TableHead>Rol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(minutes?.attendees) && minutes.attendees.map((attendee, index) => (
                    <TableRow key={index}>
                      <TableCell>{attendee.name}</TableCell>
                      <TableCell>{attendee.position}</TableCell>
                      <TableCell>{attendee.role}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Resumen:</h3>
              <p>{minutes.summary}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Puntos clave:</h3>
              <ul className="list-disc pl-5">
                {Array.isArray(minutes?.takeaways) &&
                  minutes.takeaways.map((takeaway, index) => (
                  <li key={index}>{takeaway}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Conclusiones:</h3>
              <ul className="list-disc pl-5">
                {minutes.conclusions.map((conclusion, index) => (
                  <li key={index}>{conclusion}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Próxima reunión:</h3>
              <ul className="list-disc pl-5">
                {minutes.next_meeting.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Tareas:</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Fecha límite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {minutes.tasks.map((task, index) => (
                    <TableRow key={index}>
                      <TableCell>{task.responsible}</TableCell>
                      <TableCell>{task.description}</TableCell>
                      <TableCell>{task.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {minutes.message && (
              <div>
                <h3 className="font-semibold mb-2">Mensaje:</h3>
                <p>{minutes.message}</p>
              </div>
            )}

            {processedCritiques.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Críticas procesadas:</h3>
                <ul className="list-disc pl-5">
                  {processedCritiques.map((critique, index) => (
                    <li key={index}>{critique}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Agregar crítica:</h3>
              <Textarea
                value={critique}
                onChange={(e) => setCritique(e.target.value)}
                placeholder="Escribe tu crítica aquí"
                rows={4}
                className="w-full mb-4"
              />
              <Button onClick={handleSendCritique} disabled={isSendingCritique}>
                {isSendingCritique ? 'Enviando crítica...' : 'Enviar crítica'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {minutes && (
        <div className="mt-6 flex space-x-4">
          <Button onClick={handleSave} className="bg-green-500 hover:bg-green-600">
            Guardar Acta
          </Button>
          <Button onClick={handleRestart} variant="outline">
            Comenzar de Nuevo
          </Button>
        </div>
      )}
    </div>
  );
}
