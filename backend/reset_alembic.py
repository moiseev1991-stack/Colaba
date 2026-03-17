"""Reset alembic version to 006 (before 007)"""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def reset_alembic():
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE alembic_version SET version_num = '006', down_revision = '005' WHERE version_num = '007'"))
        await db.commit()
        print('Alembic version reset to 006')
        await db.close()

if __name__ == '__main__':
    asyncio.run(reset_alembic())
