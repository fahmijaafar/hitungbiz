import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Company, User


def test_soft_delete_company_hides_it_from_normal_listing(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    payload = {
        "company_name": "Soft Delete Co",
        "currency": "USD",
        "registration_number": "SR-001",
        "company_email": "soft-delete@example.com",
        "phone_number": "+123456789",
        "company_url": "https://example.com",
        "company_address": "123 Test Street",
    }

    create_response = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=superuser_token_headers,
        json=payload,
    )
    assert create_response.status_code == 200
    created_company = create_response.json()
    company_id = created_company["id"]

    list_response = client.get(
        f"{settings.API_V1_STR}/companies/?limit=1000",
        headers=superuser_token_headers,
    )
    assert list_response.status_code == 200
    company_ids = [company["id"] for company in list_response.json()["data"]]
    assert company_id in company_ids

    delete_response = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}",
        headers=superuser_token_headers,
    )
    assert delete_response.status_code == 200

    list_after_delete = client.get(
        f"{settings.API_V1_STR}/companies/?limit=1000",
        headers=superuser_token_headers,
    )
    assert list_after_delete.status_code == 200
    company_ids_after_delete = [
        company["id"] for company in list_after_delete.json()["data"]
    ]
    assert company_id not in company_ids_after_delete

    company_in_db = db.get(Company, uuid.UUID(company_id))
    assert company_in_db is not None
    assert company_in_db.is_active is False

    read_response = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}",
        headers=superuser_token_headers,
    )
    assert read_response.status_code == 404


def test_owner_can_delete_company(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    from tests.utils.user import authentication_token_from_email, create_random_user

    user = create_random_user(db)
    user.email_verified = True
    db.add(user)
    db.commit()
    user_headers = authentication_token_from_email(client=client, email=user.email, db=db)

    # Create Company A
    payload_a = {
        "company_name": "Owner Delete Co A",
        "currency": "MYR",
        "registration_number": "OWN-001",
        "company_email": "owner_a@example.com",
        "phone_number": "+123456789",
    }
    create_res_a = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=user_headers,
        json=payload_a,
    )
    assert create_res_a.status_code == 200
    company_id_a = create_res_a.json()["id"]

    # Create Company B and set as active company
    payload_b = {
        "company_name": "Owner Delete Co B",
        "currency": "MYR",
        "registration_number": "OWN-002",
        "company_email": "owner_b@example.com",
        "phone_number": "+123456789",
    }
    create_res_b = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=user_headers,
        json=payload_b,
    )
    assert create_res_b.status_code == 200
    company_id_b = create_res_b.json()["id"]

    # Switch active company to Company B
    select_res = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=user_headers,
        json={"company_id": company_id_b},
    )
    assert select_res.status_code == 200

    # Delete non-active Company A
    delete_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id_a}",
        headers=user_headers,
    )
    assert delete_res.status_code == 200


def test_cannot_delete_active_company(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    from tests.utils.user import authentication_token_from_email, create_random_user

    user = create_random_user(db)
    user.email_verified = True
    db.add(user)
    db.commit()
    user_headers = authentication_token_from_email(client=client, email=user.email, db=db)

    payload = {
        "company_name": "Active Delete Guardrail Co",
        "currency": "MYR",
        "registration_number": "ACT-001",
        "company_email": "active_guardrail@example.com",
        "phone_number": "+123456789",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=user_headers,
        json=payload,
    )
    assert create_res.status_code == 200
    company_id = create_res.json()["id"]

    # Set as active company
    select_res = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=user_headers,
        json={"company_id": company_id},
    )
    assert select_res.status_code == 200

    # Attempt to delete active company
    delete_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}",
        headers=user_headers,
    )
    assert delete_res.status_code == 400
    assert (
        delete_res.json()["detail"]
        == "Cannot delete your current active company. Please select another active company first or create a new company."
    )


def test_non_owner_cannot_delete_company(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    from tests.utils.user import create_random_user, authentication_token_from_email

    user1 = create_random_user(db)
    user1.email_verified = True
    db.add(user1)
    db.commit()

    user1_headers = authentication_token_from_email(client=client, email=user1.email, db=db)

    # User 1 creates company
    payload = {
        "company_name": "User 1 Co",
        "currency": "MYR",
        "registration_number": "U1-001",
        "company_email": "user1co@example.com",
        "phone_number": "+123456789",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=user1_headers,
        json=payload,
    )
    assert create_res.status_code == 200
    company_id = create_res.json()["id"]

    # User 2 joins company
    user2 = create_random_user(db)
    user2.email_verified = True
    db.add(user2)
    db.commit()

    user2_headers = authentication_token_from_email(
        client=client, email=user2.email, db=db
    )
    join_res = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=user2_headers,
        json={"company_id": company_id},
    )
    assert join_res.status_code == 200

    # User 2 tries to delete company
    delete_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}",
        headers=user2_headers,
    )
    assert delete_res.status_code == 403
    assert delete_res.json()["detail"] == "Not enough permissions to delete this company"


def test_superuser_companies_array_not_modified_on_company_creation(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    from tests.utils.user import create_random_user, authentication_token_from_email

    superuser = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert superuser is not None
    initial_superuser_companies = superuser.companies

    user = create_random_user(db)
    user.email_verified = True
    db.add(user)
    db.commit()
    user_headers = authentication_token_from_email(client=client, email=user.email, db=db)

    # Normal user creates a company
    payload = {
        "company_name": "Normal User Co Test",
        "currency": "MYR",
        "registration_number": "NUC-999",
        "company_email": "nuc@example.com",
        "phone_number": "+123456789",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=user_headers,
        json=payload,
    )
    assert create_res.status_code == 200
    created_id = create_res.json()["id"]

    db.refresh(superuser)
    # Superuser companies field must not contain the newly created company
    assert superuser.companies == initial_superuser_companies
    assert created_id not in superuser.companies

    # Superuser creates a company
    su_payload = {
        "company_name": "Superuser Co Test",
        "currency": "USD",
        "registration_number": "SUC-999",
        "company_email": "suc@example.com",
        "phone_number": "+123456789",
    }
    su_create_res = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=superuser_token_headers,
        json=su_payload,
    )
    assert su_create_res.status_code == 200
    su_created_id = su_create_res.json()["id"]

    db.refresh(superuser)
    # Superuser companies field must still remain unchanged / not record company ID
    assert su_created_id not in superuser.companies


def test_company_staff_flow(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    from app.services.subscription_service import activate_subscription
    from tests.utils.user import authentication_token_from_email, create_random_user

    owner = create_random_user(db)
    owner.email_verified = True
    db.add(owner)
    db.commit()

    activate_subscription(db, user_id=owner.id, plan="pro", billing_period="monthly")
    db.commit()

    owner_headers = authentication_token_from_email(client=client, email=owner.email, db=db)

    # 1. Create company
    payload = {
        "company_name": "Staff Test Co",
        "currency": "MYR",
        "registration_number": "ST-001",
        "company_email": "staffco@example.com",
        "phone_number": "+123456789",
    }
    create_res = client.post(
        f"{settings.API_V1_STR}/companies/",
        headers=owner_headers,
        json=payload,
    )
    assert create_res.status_code == 200
    company_id = create_res.json()["id"]

    # 2. GET staff
    get_res = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
    )
    assert get_res.status_code == 200
    staff_data = get_res.json()
    assert staff_data["count"] == 1
    assert staff_data["data"][0]["email"] == owner.email
    assert staff_data["data"][0]["membership_type"] == "owner"

    # 3. Add non-existent user
    add_fail_res = client.post(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
        json={"email": "nonexistent_staff_user_123@example.com"},
    )
    assert add_fail_res.status_code == 400
    assert "User with this email does not exist." in add_fail_res.json()["detail"]

    # 4. Add existing user
    member = create_random_user(db)
    member.email_verified = True
    db.add(member)
    db.commit()

    add_res = client.post(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
        json={"email": member.email},
    )
    assert add_res.status_code == 200
    assert add_res.json()["email"] == member.email
    assert add_res.json()["membership_type"] == "member"

    # 5. Add duplicate member
    add_dup_res = client.post(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
        json={"email": member.email},
    )
    assert add_dup_res.status_code == 400
    assert add_dup_res.json()["detail"] == "This user is already a member of this company."

    # 6. GET staff (should have owner first, then member)
    get_res2 = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
    )
    assert get_res2.status_code == 200
    assert get_res2.json()["count"] == 2
    assert get_res2.json()["data"][0]["membership_type"] == "owner"
    assert get_res2.json()["data"][1]["membership_type"] == "member"

    # 7. Non-owner member permission checks
    member_headers = authentication_token_from_email(
        client=client, email=member.email, db=db
    )
    member_add_res = client.post(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=member_headers,
        json={"email": "anyone@example.com"},
    )
    assert member_add_res.status_code == 403
    assert member_add_res.json()["detail"] == "You do not have permission to perform this action."

    # 8. Delete owner fails
    del_owner_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}/staff/{owner.id}",
        headers=owner_headers,
    )
    assert del_owner_res.status_code == 400
    assert del_owner_res.json()["detail"] == "The company owner cannot be removed."

    # 9. Delete member succeeds
    del_member_res = client.delete(
        f"{settings.API_V1_STR}/companies/{company_id}/staff/{member.id}",
        headers=owner_headers,
    )
    assert del_member_res.status_code == 200
    assert del_member_res.json()["message"] == "Staff member removed successfully."

    # 10. GET staff after deletion
    get_res3 = client.get(
        f"{settings.API_V1_STR}/companies/{company_id}/staff",
        headers=owner_headers,
    )
    assert get_res3.status_code == 200
    assert get_res3.json()["count"] == 1



