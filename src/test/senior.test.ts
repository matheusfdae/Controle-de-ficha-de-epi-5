import { describe, it, expect } from 'vitest';
import {
  buildEnvelope, seniorEndpoint, parseConsultarColaborador, parseSeniorDate,
  normalizeCpf, formatTelefone, SeniorError, SERVICO_CONSULTAR_COLABORADOR,
  cpfValido, escolherCadastro, type ColaboradorSenior,
} from '../../supabase/functions/_shared/senior';

const cfg = { baseUrl: 'http://senior:8080/g5-senior-services/', module: 'rubi', user: 'integ', password: 'a<b&c' };

const resposta = (corpo: string) => `<?xml version="1.0"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>
<ns2:ConsultarColaboradorResponse xmlns:ns2="http://services.senior.com.br">
<result>${corpo}</result>
</ns2:ConsultarColaboradorResponse></S:Body></S:Envelope>`;

const colaborador = `<erroExecucao xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
<TMCSColaboradores>
  <NumEmp>1</NumEmp><NomEmp>5 ESTRELAS</NomEmp><TipCol>1</TipCol><DscTipCol>Empregado</DscTipCol>
  <NumCad>1234</NumCad><NomFun>MARIA DA SILVA &amp; SOUZA</NomFun><NumCpf>1234567890</NumCpf>
  <EmaCom></EmaCom><DatAdm>15/03/2022</DatAdm><CodFil>2</CodFil><RazSoc>FILIAL DF</RazSoc>
  <CodLoc>1.2.3</CodLoc><NomLoc>HOSPITAL X</NomLoc><CodCar>ASG01</CodCar><TitCar>ASG</TitCar>
  <CodCcu>100</CodCcu><NomCcu>LIMPEZA</NomCcu><SitAfa>1</SitAfa><DesSit>Trabalhando</DesSit>
  <DatAfa>31/12/1900</DatAfa><DDITel>55</DDITel><DDDTel>61</DDDTel><NumTel>999998888</NumTel>
  <NomMae>NAO DEVE SER USADO</NomMae>
</TMCSColaboradores>`;

describe('senior SOAP', () => {
  it('monta endpoint e envelope com escape', () => {
    expect(seniorEndpoint(cfg, SERVICO_CONSULTAR_COLABORADOR))
      .toBe('http://senior:8080/g5-senior-services/rubi_Synccom_senior_g5_rh_fp_consultarColaborador');
    const env = buildEnvelope('ConsultarColaborador', cfg, { numEmp: 1, tipCol: 1, numCad: 1234 });
    expect(env).toContain('<ser:ConsultarColaborador><user>integ</user><password>a&lt;b&amp;c</password>');
    expect(env).toContain('<parameters><numEmp>1</numEmp><tipCol>1</tipCol><numCad>1234</numCad></parameters>');
  });

  it('interpreta TMCSColaboradores só com os campos usados', () => {
    const [c] = parseConsultarColaborador(resposta(colaborador));
    expect(c).toMatchObject({
      numEmp: 1, tipCol: 1, numCad: 1234, nome: 'MARIA DA SILVA & SOUZA',
      cpf: '01234567890', telefone: '(61) 999998888', email: null,
      dataAdmissao: '2022-03-15', dataAfastamento: null, codFil: 2,
      nomeLocal: 'HOSPITAL X', cargo: 'ASG', centroCusto: 'LIMPEZA',
      situacao: 1, situacaoDescricao: 'Trabalhando', rg: null,
    });
    expect(JSON.stringify(c)).not.toContain('NAO DEVE SER USADO');
  });

  it('aceita os campos em camelCase da Senior Cloud', () => {
    const cloud = `<erroExecucao/><TMCSColaboradores><numEmp>1</numEmp><tipCol>1</tipCol><numCad>77</numCad>
      <nomFun>JOSE</nomFun><numCpf>98765432100</numCpf><numCid> 3456789 </numCid><emiCid>SSP</emiCid>
      <nomLoc>POSTO Y</nomLoc><titCar>VIGILANTE</titCar>
      <sitAfa>1</sitAfa><desSit>Trabalhando</desSit><datAdm>01/02/2023</datAdm><dddTel>62</dddTel><numTel>988887777</numTel>
    </TMCSColaboradores>`;
    expect(parseConsultarColaborador(resposta(cloud))[0]).toMatchObject({
      numEmp: 1, tipCol: 1, numCad: 77, nome: 'JOSE', cpf: '98765432100', rg: '3456789', nomeLocal: 'POSTO Y',
      cargo: 'VIGILANTE', situacao: 1, dataAdmissao: '2023-02-01', telefone: '(62) 988887777',
    });
  });

  it('lista vazia quando a matrícula não existe (TMCSColaboradores vazio)', () => {
    expect(parseConsultarColaborador(resposta('<erroExecucao/><TMCSColaboradores/>'))).toEqual([]);
  });

  it('credenciais inválidas vêm em erroExecucao (resposta real da Senior Cloud)', () => {
    expect(() => parseConsultarColaborador(resposta(
      '<erroExecucao>Ocorreu um erro ao executar o serviço "AP - Consultar colaborador": Credenciais inválidas.</erroExecucao><TMCSColaboradores/>',
    ))).toThrow(/Credenciais inválidas/);
  });

  it('lista vazia quando a matrícula não existe', () => {
    expect(parseConsultarColaborador(resposta('<erroExecucao/>'))).toEqual([]);
  });

  it('propaga erroExecucao e SOAP Fault', () => {
    expect(() => parseConsultarColaborador(resposta('<erroExecucao>Usuário sem permissão</erroExecucao>')))
      .toThrow(new SeniorError('Senior: Usuário sem permissão'));
    expect(() => parseConsultarColaborador('<S:Fault><faultstring>Credenciais inválidas</faultstring></S:Fault>'))
      .toThrow(/Credenciais inválidas/);
  });

  it('normaliza datas, CPF e telefone', () => {
    expect(parseSeniorDate('31/12/1900')).toBeNull();
    expect(parseSeniorDate('2024-01-05T00:00:00')).toBe('2024-01-05');
    expect(normalizeCpf('0')).toBeNull();
    expect(normalizeCpf('123.456.789-01')).toBe('12345678901');
    expect(formatTelefone('0', '0', '0')).toBeNull();
    expect(formatTelefone('351', '21', '912345678')).toBe('+351 (21) 912345678');
  });

  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('1234')).toBe(false);
  });

  it('com vários cadastros no mesmo CPF, escolhe o ativo mais recente', () => {
    const c = (numCad: number, situacao: number, dataAdmissao: string) =>
      ({ numCad, situacao, dataAdmissao } as ColaboradorSenior);
    expect(escolherCadastro([c(1, 1, '2019-01-01'), c(2, 7, '2024-01-01'), c(3, 2, '2022-05-01')])?.numCad).toBe(3);
    expect(escolherCadastro([c(1, 7, '2019-01-01'), c(2, 7, '2024-01-01')])?.numCad).toBe(2);
    expect(escolherCadastro([])).toBeUndefined();
  });
});
