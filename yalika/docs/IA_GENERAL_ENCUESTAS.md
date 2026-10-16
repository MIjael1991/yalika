# IA general para encuestas

El creador de encuestas funciona en dos niveles:

1. **IA general:** entiende cualquier tema y también instrucciones para modificar el borrador, por ejemplo “cambia la pregunta 3”, “agrega dos preguntas” o “hazla anónima”.
2. **Respaldo local:** si falta conexión, saldo o configuración de IA, prepara una encuesta general editable para que el usuario no quede bloqueado.

## Activación local

1. Ejecutar `CONFIGURAR_IA_ENCUESTAS.bat`.
2. Pegar una clave de API de OpenAI. La clave se guarda únicamente en `apps/api/.env` y no se incluye en los paquetes.
3. Aceptar `gpt-5-mini` como modelo económico o escribir otro modelo disponible.
4. Reiniciar la API.

Variables utilizadas:

```env
OPENAI_API_KEY=...
OPENAI_SURVEY_MODEL=gpt-5-mini
```

En el servidor se configuran las mismas variables como secretos. La clave nunca debe enviarse al navegador ni guardarse dentro del código.

## Comportamiento

- El borrador actual se envía junto con la nueva instrucción para conservar los cambios previos.
- Las respuestas de la IA se validan y normalizan antes de mostrarse.
- Las escalas explican sus extremos.
- Las preguntas de texto no se publican como resultados agregados.
- En salud y psicología la IA evita diagnósticos y medicamentos; los instrumentos requieren revisión profesional.
- La solicitud usa `store: false`.

