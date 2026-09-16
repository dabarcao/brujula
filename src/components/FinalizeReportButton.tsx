"use client";

// Envuelve el form de "Finalizar informe" con una confirmación nativa
// del navegador — window.confirm bloquea el envío del formulario si se
// cancela. Cliente aparte (en vez de meter un onClick en la página,
// server component) porque hace falta un manejador de eventos real.
export default function FinalizeReportButton({
  requestId,
  confirmMessage,
  action,
}: {
  requestId: string;
  confirmMessage: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
      >
        Finalizar informe
      </button>
    </form>
  );
}
