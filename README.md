Entity-Relationship Diagram (ERD)
เอกสารนี้อธิบายโครงสร้างและความสัมพันธ์ของตารางต่างๆ ในฐานข้อมูลของโปรเจกต์

```mermaid
---
config:
  layout: dagre
---
erDiagram
    users {
        INTEGER user_id PK
        TEXT email
        TEXT first_name
        TEXT last_name
        TEXT access_token
        TIMESTAMPTZ created_at
        TEXT[] providers
    }

    usage_types{
        UUID usage_type_id PK
        TEXT type_value
        TEXT type_label
    }

    organizations {
        INTEGER organization_id PK
        TEXT organization_code UK
        TEXT organization_name
        TIMESTAMPTZ created_at
        TEXT url_logo
        UUID org_type_id FK
        UUID usage_type_id FK
        TEXT admin_code
        TEXT contact_phone
        TEXT rovince    
        TEXT district   
        TEXT sub_district
    }
    organization_types {
        SERAIL org_type_id PK
        TEXT type_value
        TEXT type_label
    }
    issue_types {
        UUID issue_id PK
        TEXT name
        TEXT description
        TEXT icon_url
    }
    issue_cases {
        UUID issue_cases_id PK
        VARCHAR(7) case_code
        TEXT title
        TEXT description
        TEXT cover_image_url
        UUID issue_type_id FK
        TEXT status "enum: case_status"
        NUMERIC latitude
        NUMERIC longitude
        TEXT[] tags
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }
    user_log {
        SERAIL log_id PK
        INTEGER user_id FK
        TEXT action_type
        TEXT provider
        TEXT ip_address
        TEXT user_agent
        TEXT status
        TIMESTAMPTZ created_at
    }
    users_organizations {
        INTEGER user_id PK, FK
        TEXT organization_code PK, FK
        TEXT role
        TIMESTAMPTZ joined_at
    }
    case_media {
        UUID id PK
        UUID case_id FK
        TEXT media_type
        TEXT url
        TIMESTAMPTZ created_at
    }
    case_organizations {
        UUID case_id PK, FK
        INTEGER organization_id PK, FK
        BOOLEAN is_viewed
    }
    case_activity_logs {
        BIGSERIAL log_id PK
        UUID case_id FK
        INTEGER changed_by_user_id FK
        TEXT activity_type "enum: case_activity_type"
        TEXT old_value
        TEXT new_value
        TEXT comment
        TIMESTAMPTZ created_at
    }
    case_ratings{
    INTIGER rating_id PK
    UUID issue_case_id FK
    INTIGER user_id FK
    SMALLINT score
    TIMESPAMPTZ created_at
    TEXT comment
    }
    users               ||--o{ case_ratings : "gives"
    issue_cases         ||--o{ case_ratings : "receives"
    users               ||--|{ user_log : "has"
    organization_types  ||--|{ organizations : "classifies"
    usage_types         ||--|{ organizations : "classifies"
    users               ||--o{ users_organizations : "is_member_of"
    organizations       ||--o{ users_organizations : "has_member"
    issue_cases         }o--|| issue_types : "has type"
    issue_cases         ||--|{ case_media : "has media"
    issue_cases         ||--|{ case_activity_logs : "has logs"
    users               }o--|{ case_activity_logs : "changed by"
    issue_cases         ||--o{ case_organizations : "assigned to"
    organizations       ||--o{ case_organizations : "responsible for"

```

คำอธิบายตาราง (Entities)
1. users
ตารางสำหรับเก็บข้อมูลผู้ใช้งานในระบบ

id (PK): รหัสอ้างอิงหลักของผู้ใช้
email: อีเมลของผู้ใช้
first_name: ชื่อจริง
last_name: นามสกุล
access_token: Token ที่ใช้ในการยืนยันตัวตนผ่าน API
created_at: วันและเวลาที่สร้างบัญชีผู้ใช้
providers: รายชื่อช่องทางที่ใช้ในการสมัคร/ล็อกอิน (เช่น ['google', 'facebook' , 'line'])

2. organizations
ตารางสำหรับเก็บข้อมูลหน่วยงานหรือองค์กร

organization_id (PK): รหัสอ้างอิงหลักของหน่วยงาน
organization_code: รหัสย่อของหน่วยงาน
organization_name: ชื่อเต็มของหน่วยงาน
created_at: วันและเวลาที่สร้างหน่วยงาน

3. user_logs
ตารางสำหรับบันทึกกิจกรรม (logs) ทั้งหมดที่เกิดขึ้นจากผู้ใช้

log_id (PK): รหัสอ้างอิงหลักของ Log
user_id (FK): รหัสผู้ใช้ที่ก่อให้เกิดกิจกรรม (อ้างอิงถึง users.id)
action_type: ประเภทของกิจกรรม (เช่น login, logout, create_ticket)
provider: ช่องทางที่ผู้ใช้ล็อกอินเข้ามาในขณะนั้น
ip_address: IP Address ของผู้ใช้
created_at: วันและเวลาที่เกิดกิจกรรม

4. users_organizations
ตารางเชื่อม (Junction Table) สำหรับสร้างความสัมพันธ์แบบ Many-to-Many ระหว่าง users และ organizations

user_id (PK, FK): รหัสผู้ใช้ (อ้างอิงถึง users.id)
organization_id (PK, FK): รหัสหน่วยงาน (อ้างอิงถึง organizations.organization_id)
role: บทบาทของผู้ใช้ในหน่วยงานนั้นๆ (เช่น admin, member)
joined_at: วันและเวลาที่ผู้ใช้เข้าร่วมหน่วยงาน

ความสัมพันธ์ (Relationships)

ผู้ใช้ (users) กับ หน่วยงาน (organizations): เป็นความสัมพันธ์แบบ Many-to-Many ผู้ใช้ 1 คน สามารถสังกัดได้หลายหน่วยงาน หน่วยงาน 1 แห่ง สามารถมีผู้ใช้ได้หลายคน โดยมีความสัมพันธ์ผ่านตาราง users_organizations ซึ่งถ้ามีการ add user_id กับ organiation_id ก็จะดึงข้อมูลของ user และ organization เข้ามาในตาราง users_organizations 
ผู้ใช้ (users) กับ ล็อก (user_logs): เป็นความสัมพันธ์แบบ One-to-Many ผู้ใช้ 1 คน สามารถมีประวัติการใช้งาน (logs) ได้หลายรายการ แต่ log 1 รายการ จะเป็นของผู้ใช้เพียงคนเดียวเท่านั้น
