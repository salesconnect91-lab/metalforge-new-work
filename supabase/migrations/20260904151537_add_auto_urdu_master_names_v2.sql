alter table public.customers add column if not exists name_urdu text;
alter table public.suppliers add column if not exists name_urdu text;
alter table public.items add column if not exists name_urdu text;
alter table public.categories add column if not exists name_urdu text;
alter table public.uom add column if not exists name_urdu text;
alter table public.transporters add column if not exists name_urdu text;
alter table public.warehouses add column if not exists name_urdu text;
alter table public.godowns add column if not exists name_urdu text;
alter table public.charge_master add column if not exists charge_name_urdu text;

create or replace function public.english_to_urdu_name(p_text text)
returns text language plpgsql immutable strict set search_path=public,pg_temp as $$
declare v text:=lower(trim(p_text)); w text; out_text text:=''; token text; mapped text; parts text[];
begin
 if p_text ~ '[\u0600-\u06FF]' then return trim(p_text); end if;
 v:=regexp_replace(v,'[^a-z0-9]+',' ','g'); v:=regexp_replace(v,'\s+',' ','g'); parts:=regexp_split_to_array(trim(v),'\s+');
 foreach token in array parts loop
  mapped:=case token
   when 'ali' then 'علی' when 'ahmed' then 'احمد' when 'ahmad' then 'احمد' when 'muhammad' then 'محمد' when 'mohammad' then 'محمد' when 'mohammed' then 'محمد' when 'farhan' then 'فرحان' when 'khan' then 'خان' when 'sons' then 'سنز' when 'brothers' then 'برادرز'
   when 'ms' then 'ایم ایس' when 'ss' then 'ایس ایس' when 'gi' then 'جی آئی' when 'steel' then 'اسٹیل' when 'iron' then 'آئرن' when 'metal' then 'میٹل' when 'metals' then 'میٹلز' when 'mill' then 'مل' when 'mills' then 'ملز' when 'trader' then 'ٹریڈر' when 'traders' then 'ٹریڈرز' when 'trading' then 'ٹریڈنگ' when 'industry' then 'انڈسٹری' when 'industries' then 'انڈسٹریز' when 'company' then 'کمپنی' when 'enterprise' then 'انٹرپرائز' when 'enterprises' then 'انٹرپرائزز'
   when 'sheet' then 'شیٹ' when 'sheets' then 'شیٹس' when 'pipe' then 'پائپ' when 'pipes' then 'پائپس' when 'coil' then 'کوائل' when 'coils' then 'کوائلز' when 'bar' then 'بار' when 'bars' then 'بارز' when 'rod' then 'راڈ' when 'rods' then 'راڈز' when 'scrap' then 'اسکریپ' when 'plate' then 'پلیٹ' when 'plates' then 'پلیٹس' when 'angle' then 'اینگل' when 'angles' then 'اینگلز' when 'channel' then 'چینل' when 'channels' then 'چینلز'
   when 'customer' then 'کسٹمر' when 'supplier' then 'سپلائر' when 'transport' then 'ٹرانسپورٹ' when 'transporter' then 'ٹرانسپورٹر' when 'loading' then 'لوڈنگ' when 'unloading' then 'ان لوڈنگ' when 'cutting' then 'کٹنگ' when 'labour' then 'لیبر' when 'labor' then 'لیبر' when 'handling' then 'ہینڈلنگ' when 'freight' then 'فریٹ' when 'charge' then 'چارج' when 'charges' then 'چارجز' when 'warehouse' then 'گودام' when 'godown' then 'گودام' when 'kilogram' then 'کلوگرام' when 'kilograms' then 'کلوگرام' when 'kg' then 'کلوگرام' when 'ton' then 'ٹن' when 'tons' then 'ٹن' when 'piece' then 'عدد' when 'pieces' then 'عدد' when 'pcs' then 'عدد' else null end;
  if mapped is null then
   w:=token; w:=replace(w,'sh','ش');w:=replace(w,'ch','چ');w:=replace(w,'kh','خ');w:=replace(w,'gh','غ');w:=replace(w,'ph','ف');w:=replace(w,'th','تھ');w:=replace(w,'dh','دھ');w:=replace(w,'zh','ژ');w:=replace(w,'aa','ا');w:=replace(w,'ee','ی');w:=replace(w,'oo','و');w:=replace(w,'ou','اؤ');w:=replace(w,'ai','ائی');w:=replace(w,'ay','ے');w:=replace(w,'a','ا');w:=replace(w,'b','ب');w:=replace(w,'c','ک');w:=replace(w,'d','د');w:=replace(w,'e','ے');w:=replace(w,'f','ف');w:=replace(w,'g','گ');w:=replace(w,'h','ہ');w:=replace(w,'i','ی');w:=replace(w,'j','ج');w:=replace(w,'k','ک');w:=replace(w,'l','ل');w:=replace(w,'m','م');w:=replace(w,'n','ن');w:=replace(w,'o','و');w:=replace(w,'p','پ');w:=replace(w,'q','ق');w:=replace(w,'r','ر');w:=replace(w,'s','س');w:=replace(w,'t','ت');w:=replace(w,'u','و');w:=replace(w,'v','و');w:=replace(w,'w','و');w:=replace(w,'x','کس');w:=replace(w,'y','ی');w:=replace(w,'z','ز');mapped:=w;
  end if; out_text:=concat_ws(' ',nullif(out_text,''),mapped);
 end loop; return nullif(trim(out_text),'');
end;$$;
revoke all on function public.english_to_urdu_name(text) from public,anon; grant execute on function public.english_to_urdu_name(text) to authenticated;

create or replace function public.auto_fill_urdu_master_name() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='charge_master' then
  if coalesce(trim(new.charge_name_urdu),'')='' and coalesce(trim(new.charge_name),'')<>'' then new.charge_name_urdu:=public.english_to_urdu_name(new.charge_name); end if;
 else
  if coalesce(trim(new.name_urdu),'')='' and coalesce(trim(new.name),'')<>'' then new.name_urdu:=public.english_to_urdu_name(new.name); end if;
 end if; return new;
end;$$;
revoke all on function public.auto_fill_urdu_master_name() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['customers','suppliers','items','categories','uom','transporters','warehouses','godowns','charge_master'] loop execute format('drop trigger if exists trg_auto_urdu_name on public.%I',t);execute format('create trigger trg_auto_urdu_name before insert or update on public.%I for each row execute function public.auto_fill_urdu_master_name()',t);end loop;end $$;
