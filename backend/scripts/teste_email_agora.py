from dotenv import load_dotenv
load_dotenv(dotenv_path='app/.env')
import os
from app.utils.mailer import send_email

print('📧 TESTE DE EMAIL PJMOL')
print('=' * 30)

# Mostrar configurações
configs = {
    'SMTP_HOST': os.getenv('SMTP_HOST'),
    'SMTP_PORT': os.getenv('SMTP_PORT'), 
    'SMTP_USERNAME': os.getenv('SMTP_USERNAME'),
    'MAIL_FROM': os.getenv('MAIL_FROM')
}

for key, value in configs.items():
    status = '✅' if value else '❌'
    print(f'{status} {key}: {value}')

print('\n📤 Enviando email para leonardofmol@gmail.com...')

try:
    resultado = send_email(
        recipients='leonardofmol@gmail.com',
        subject='[TESTE PJMOL] Sistema de Emails Funcionando!',
        body_html='''
        <h2>✅ Teste de Email - Sistema PJMOL</h2>
        <p>Parabéns! O sistema de envio de emails está funcionando corretamente!</p>
        <h3>Detalhes:</h3>
        <ul>
            <li>Data: 31 de outubro de 2025</li>
            <li>Sistema: Backend PJMOL</li>
            <li>Servidor: smtp.hostinger.com</li>
            <li>Status: Operacional</li>
        </ul>
        <p>Agora você pode usar todas as funcionalidades de email do sistema!</p>
        '''
    )
    
    if resultado:
        print('✅ EMAIL ENVIADO COM SUCESSO!')
        print('📧 Destinatário: leonardofmol@gmail.com')
        print('📱 Verifique sua caixa de entrada (e pasta de spam)')
        print('🎉 Sistema de emails funcionando!')
    else:
        print('❌ FALHA NO ENVIO')
        print('🔧 Verifique as configurações SMTP')
        
except Exception as e:
    print(f'❌ ERRO: {e}')
    print(f'🔧 Tipo: {type(e).__name__}')

print('\n' + '=' * 30)