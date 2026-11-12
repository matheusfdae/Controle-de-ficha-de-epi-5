-- Apaga os lançamentos fictícios criados por subir.sql.
DELETE FROM movimentacoes_diarias WHERE codigo LIKE 'DEMO-%';
