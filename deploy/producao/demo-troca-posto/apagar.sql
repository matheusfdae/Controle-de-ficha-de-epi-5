-- Apaga as trocas de posto fictícias (subir.sql). Só banco de teste.
DELETE FROM trocas_posto WHERE codigo LIKE 'TP-DEMO%';
