"""
Скрипт для генерации тестовых данных: 50 организаций и 200 пользователей.
"""

import asyncio
import random
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func

from app.core.database import Base, get_db
from app.core.config import settings
from app.models.organization import Organization, OrganizationRole, user_organizations
from app.models.user import User
from app.core.security import hash_password

# Database URL
DATABASE_URL = settings.DATABASE_URL

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def create_test_organizations(db: AsyncSession, count: int = 50):
    """Создать тестовые организации."""
    # Проверить существующие организации
    existing_result = await db.execute(select(Organization))
    existing_orgs = existing_result.scalars().all()
    existing_count = len(existing_orgs)
    
    # Найти максимальный номер существующей тестовой организации
    max_num = 0
    for org in existing_orgs:
        if org.name.startswith("Test Organization "):
            try:
                num = int(org.name.replace("Test Organization ", ""))
                max_num = max(max_num, num)
            except:
                pass
    
    organizations = list(existing_orgs)
    new_count = 0
    
    # Создать новые организации
    for i in range(max_num + 1, max_num + count + 1):
        org = Organization(name=f"Test Organization {i}")
        db.add(org)
        organizations.append(org)
        new_count += 1
    
    if new_count > 0:
        await db.commit()
        # Refresh to get IDs
        for org in organizations[-new_count:]:
            await db.refresh(org)
    
    print(f"✅ Всего организаций: {len(organizations)} (существовало: {existing_count}, создано новых: {new_count})")
    return organizations


async def create_test_users(db: AsyncSession, count: int = 200):
    """Создать тестовых пользователей."""
    # Проверить существующих пользователей
    existing_result = await db.execute(select(User))
    existing_users = existing_result.scalars().all()
    existing_count = len(existing_users)
    
    # Найти максимальный номер существующего тестового пользователя
    max_num = 0
    for user in existing_users:
        if user.email.startswith("testuser") and user.email.endswith("@example.com"):
            try:
                num = int(user.email.replace("testuser", "").replace("@example.com", ""))
                max_num = max(max_num, num)
            except:
                pass
    
    users = list(existing_users)
    new_count = 0
    
    # Создать новых пользователей
    for i in range(max_num + 1, max_num + count + 1):
        email = f"testuser{i}@example.com"
        password = hash_password("test123456")
        
        user = User(
            email=email,
            hashed_password=password,
            is_active=True,
            is_superuser=False
        )
        db.add(user)
        users.append(user)
        new_count += 1
    
    if new_count > 0:
        await db.commit()
        # Refresh to get IDs
        for user in users[-new_count:]:
            await db.refresh(user)
    
    print(f"✅ Всего пользователей: {len(users)} (существовало: {existing_count}, создано новых: {new_count})")
    return users


async def assign_users_to_organizations(
    db: AsyncSession,
    users: list[User],
    organizations: list[Organization]
):
    """Случайно распределить пользователей по организациям."""
    from datetime import datetime
    
    # Получить существующие связи
    existing_result = await db.execute(select(user_organizations))
    existing_links = existing_result.all()
    existing_pairs = {(link[0], link[1]) for link in existing_links}  # (user_id, org_id)
    
    assignments = []
    roles = [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MEMBER]
    
    # Каждый пользователь должен быть хотя бы в одной организации
    for user in users:
        # Случайное количество организаций для пользователя (1-3)
        num_orgs = random.randint(1, min(3, len(organizations)))
        selected_orgs = random.sample(organizations, num_orgs)
        
        for org in selected_orgs:
            # Пропустить, если связь уже существует
            if (user.id, org.id) in existing_pairs:
                continue
            
            # Первая организация - случайная роль, остальные - MEMBER
            if org == selected_orgs[0]:
                role = random.choice(roles)
            else:
                role = OrganizationRole.MEMBER
            
            assignments.append({
                'user_id': user.id,
                'organization_id': org.id,
                'role': role,
                'created_at': datetime.utcnow()
            })
            existing_pairs.add((user.id, org.id))  # Добавить в множество, чтобы избежать дубликатов
    
    # Вставить все назначения
    if assignments:
        await db.execute(
            user_organizations.insert(),
            assignments
        )
        await db.commit()
    
    print(f"✅ Назначено {len(assignments)} новых связей пользователь-организация")
    return len(assignments)


async def verify_data(db: AsyncSession):
    """Проверить созданные данные."""
    # Проверить организации
    org_result = await db.execute(select(func.count(Organization.id)))
    org_count = org_result.scalar_one()
    
    # Проверить пользователей
    user_result = await db.execute(select(func.count(User.id)))
    user_count = user_result.scalar_one()
    
    # Проверить связи
    link_result = await db.execute(select(func.count(user_organizations.c.user_id)))
    link_count = link_result.scalar_one()
    
    # Статистика по ролям
    owner_result = await db.execute(
        select(func.count(user_organizations.c.user_id))
        .where(user_organizations.c.role == OrganizationRole.OWNER)
    )
    owner_count = owner_result.scalar_one()
    
    admin_result = await db.execute(
        select(func.count(user_organizations.c.user_id))
        .where(user_organizations.c.role == OrganizationRole.ADMIN)
    )
    admin_count = admin_result.scalar_one()
    
    member_result = await db.execute(
        select(func.count(user_organizations.c.user_id))
        .where(user_organizations.c.role == OrganizationRole.MEMBER)
    )
    member_count = member_result.scalar_one()
    
    print("\n" + "="*50)
    print("📊 СТАТИСТИКА СОЗДАННЫХ ДАННЫХ:")
    print("="*50)
    print(f"Организаций: {org_count}")
    print(f"Пользователей: {user_count}")
    print(f"Связей пользователь-организация: {link_count}")
    print(f"\nРаспределение по ролям:")
    print(f"  OWNER: {owner_count}")
    print(f"  ADMIN: {admin_count}")
    print(f"  MEMBER: {member_count}")
    print("="*50)
    
    return {
        'organizations': org_count,
        'users': user_count,
        'links': link_count,
        'roles': {
            'OWNER': owner_count,
            'ADMIN': admin_count,
            'MEMBER': member_count
        }
    }


async def get_organization_stats(db: AsyncSession, org_id: int):
    """Получить статистику по организации."""
    # Количество пользователей
    users_result = await db.execute(
        select(func.count(user_organizations.c.user_id))
        .where(user_organizations.c.organization_id == org_id)
    )
    users_count = users_result.scalar_one()
    
    return users_count


async def main():
    """Основная функция."""
    print("🚀 Начало генерации тестовых данных...")
    print("="*50)
    
    async with AsyncSessionLocal() as db:
        try:
            # Создать организации
            organizations = await create_test_organizations(db, count=50)
            
            # Создать пользователей
            users = await create_test_users(db, count=200)
            
            # Распределить пользователей по организациям
            await assign_users_to_organizations(db, users, organizations)
            
            # Проверить данные
            stats = await verify_data(db)
            
            # Проверить несколько организаций
            print("\n📋 Примеры организаций:")
            for i in range(min(5, len(organizations))):
                org = organizations[i]
                users_count = await get_organization_stats(db, org.id)
                print(f"  {org.name} (ID: {org.id}): {users_count} пользователей")
            
            print("\n✅ Генерация тестовых данных завершена успешно!")
            
        except Exception as e:
            print(f"\n❌ Ошибка: {e}")
            import traceback
            traceback.print_exc()
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(main())
